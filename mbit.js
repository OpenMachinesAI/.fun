(function (Scratch) {
  "use strict";

  // TurboWarp must run this extension UNSANDBOXED for Web Serial to work reliably.
  if (!Scratch.extensions.unsandboxed) {
    throw new Error(
      "micro:bit Serial: This extension must be run UNSANDBOXED. " +
      "In TurboWarp Desktop, trust/allow unsandboxed extensions. " +
      "In the web editor, enable unsandboxed custom extensions (or use Desktop)."
    );
  }

  const BlockType = Scratch.BlockType;
  const ArgumentType = Scratch.ArgumentType;

  class MicrobitSerial {
    constructor() {
      this.port = null;
      this.reader = null;
      this.writer = null;

      this.buffer = "";
      this.lastLine = "";
      this.bytesReceived = 0;
      this.packetsReceived = 0;

      this.state = {
        BA: 0, BB: 0,
        P0: 0, P1: 0, P2: 0,
        AX: 0, AY: 0, AZ: 0,
        PITCH: 0, ROLL: 0,
        TILT: "none"
      };

      this.events = {
        BTN_A: false,
        BTN_B: false,
        MOVE: false,
        TILT_any: false,
        TILT_front: false,
        TILT_back: false,
        TILT_left: false,
        TILT_right: false,
        PIN_0: false,
        PIN_1: false,
        PIN_2: false
      };

      this._reading = false;
      this._decoder = new TextDecoder();
      this._encoder = new TextEncoder();
    }

    // ---------- parsing ----------
    _resetEvents() {
      for (const k of Object.keys(this.events)) this.events[k] = false;
    }

    _latchTilt(dir) {
      this.events.TILT_any = true;
      if (dir === "front") this.events.TILT_front = true;
      if (dir === "back") this.events.TILT_back = true;
      if (dir === "left") this.events.TILT_left = true;
      if (dir === "right") this.events.TILT_right = true;
    }

    _parseStateLine(line) {
      // STATE BA=1 BB=0 ...
      const parts = line.slice(6).trim().split(/\s+/);
      for (const kv of parts) {
        const eq = kv.indexOf("=");
        if (eq === -1) continue;
        const k = kv.slice(0, eq);
        const v = kv.slice(eq + 1);
        if (k === "TILT") this.state.TILT = v;
        else this.state[k] = Number(v);
      }
    }

    _parseEventLine(line) {
      // EVENT BTN A / EVENT PIN 0 / EVENT MOVE / EVENT TILT left
      const rest = line.slice(6).trim();
      const parts = rest.split(/\s+/);
      const t0 = parts[0] || "";

      if (t0 === "BTN") {
        if (parts[1] === "A") this.events.BTN_A = true;
        if (parts[1] === "B") this.events.BTN_B = true;
        return;
      }
      if (t0 === "PIN") {
        if (parts[1] === "0") this.events.PIN_0 = true;
        if (parts[1] === "1") this.events.PIN_1 = true;
        if (parts[1] === "2") this.events.PIN_2 = true;
        return;
      }
      if (t0 === "MOVE") {
        this.events.MOVE = true;
        return;
      }
      if (t0 === "TILT") {
        this._latchTilt(parts[1] || "none");
        return;
      }
    }

    _handleTextChunk(text) {
      this.buffer += text;
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() || "";

      for (let raw of lines) {
        const line = raw.replace("\r", "").trim();
        if (!line) continue;

        this.lastLine = line;
        this.packetsReceived++;

        if (line.startsWith("STATE ")) this._parseStateLine(line);
        else if (line.startsWith("EVENT ")) this._parseEventLine(line);
      }
    }

    async _startReadLoop() {
      if (!this.port || !this.port.readable) return;
      if (this._reading) return;

      this._reading = true;

      try {
        this.reader = this.port.readable.getReader();
        while (this.port && this.port.readable) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value && value.length) {
            this.bytesReceived += value.length;
            const text = this._decoder.decode(value, { stream: true });
            this._handleTextChunk(text);
          }
        }
      } catch (e) {
        console.log("micro:bit read loop error:", e);
      } finally {
        this._reading = false;
        try { if (this.reader) this.reader.releaseLock(); } catch {}
        this.reader = null;
      }
    }

    async _ensureWriter() {
      if (!this.port || !this.port.writable) return false;
      if (this.writer) return true;
      try {
        this.writer = this.port.writable.getWriter();
        return true;
      } catch (e) {
        console.log("micro:bit writer error:", e);
        this.writer = null;
        return false;
      }
    }

    async _sendLine(line) {
      if (!this.port) return;
      const ok = await this._ensureWriter();
      if (!ok) return;
      try {
        const data = this._encoder.encode(line + "\n");
        await this.writer.write(data);
      } catch (e) {
        console.log("micro:bit write error:", e);
      }
    }

    // ---------- TurboWarp metadata ----------
    getInfo() {
      return {
        id: "microbitserialfull",
        name: "micro:bit Serial",
        blocks: [
          { opcode: "pair", blockType: BlockType.COMMAND, text: "pair micro:bit" },
          { opcode: "disconnect", blockType: BlockType.COMMAND, text: "disconnect" },
          { opcode: "connectedQ", blockType: BlockType.BOOLEAN, text: "connected?" },

          // Debug
          { opcode: "lastLineR", blockType: BlockType.REPORTER, text: "last line received" },
          { opcode: "bytesR", blockType: BlockType.REPORTER, text: "bytes received" },
          { opcode: "packetsR", blockType: BlockType.REPORTER, text: "packets received" },

          // Buttons
          {
            opcode: "whenButtonPressed",
            blockType: BlockType.HAT,
            text: "when [BTN] button pressed",
            arguments: { BTN: { type: ArgumentType.STRING, menu: "btnHat", defaultValue: "A" } }
          },
          {
            opcode: "buttonPressedQ",
            blockType: BlockType.BOOLEAN,
            text: "[BTN] button pressed?",
            arguments: { BTN: { type: ArgumentType.STRING, menu: "btnAB", defaultValue: "A" } }
          },

          // Motion
          { opcode: "whenMoved", blockType: BlockType.HAT, text: "when moved" },

          // Display
          {
            opcode: "displayMatrix",
            blockType: BlockType.COMMAND,
            text: "display [PATTERN]",
            arguments: { PATTERN: { type: ArgumentType.STRING, defaultValue: "00000:00100:01110:00100:00000" } }
          },
          {
            opcode: "displayText",
            blockType: BlockType.COMMAND,
            text: "display text [TEXT]",
            arguments: { TEXT: { type: ArgumentType.STRING, defaultValue: "Hello!" } }
          },
          { opcode: "clearDisplay", blockType: BlockType.COMMAND, text: "clear display" },

          // Tilt
          {
            opcode: "whenTilted",
            blockType: BlockType.HAT,
            text: "when tilted [DIR]",
            arguments: { DIR: { type: ArgumentType.STRING, menu: "tiltDir", defaultValue: "any" } }
          },
          {
            opcode: "tiltedQ",
            blockType: BlockType.BOOLEAN,
            text: "tilted [DIR] ?",
            arguments: { DIR: { type: ArgumentType.STRING, menu: "tiltDir", defaultValue: "any" } }
          },
          {
            opcode: "tiltAngle",
            blockType: BlockType.REPORTER,
            text: "tilt angle [DIR]",
            arguments: { DIR: { type: ArgumentType.STRING, menu: "tiltAngleDir", defaultValue: "front" } }
          },

          // Pin connected
          {
            opcode: "whenPinConnected",
            blockType: BlockType.HAT,
            text: "when pin [PIN] connected",
            arguments: { PIN: { type: ArgumentType.STRING, menu: "pins", defaultValue: "0" } }
          }
        ],
        menus: {
          btnHat: { items: ["A", "B", "any"] },
          btnAB: { items: ["A", "B"] },
          tiltDir: { items: ["any", "front", "back", "left", "right"] },
          tiltAngleDir: { items: ["front", "back", "left", "right"] },
          pins: { items: ["0", "1", "2"] }
        }
      };
    }

    // ---------- blocks ----------
    async pair() {
      if (!navigator.serial) {
        throw new Error("Web Serial not available. Use TurboWarp Desktop or a supported Chromium browser.");
      }
      if (this.port) return;

      // chooser must be triggered by the user clicking this block
      this.port = await navigator.serial.requestPort({});
      await this.port.open({ baudRate: 115200 });

      // start reading immediately
      this._startReadLoop();
    }

    async disconnect() {
      try { if (this.reader) await this.reader.cancel(); } catch {}
      try { if (this.reader) this.reader.releaseLock(); } catch {}
      this.reader = null;

      try { if (this.writer) this.writer.releaseLock(); } catch {}
      this.writer = null;

      try { if (this.port) await this.port.close(); } catch {}
      this.port = null;

      this.buffer = "";
      this.lastLine = "";
      this.bytesReceived = 0;
      this.packetsReceived = 0;
      this._resetEvents();
    }

    connectedQ() { return !!this.port; }

    // Debug reporters
    lastLineR() { return this.lastLine; }
    bytesR() { return this.bytesReceived; }
    packetsR() { return this.packetsReceived; }

    // Hats (consume once)
    whenButtonPressed(args) {
      const which = String(args.BTN);
      if (which === "A") { if (this.events.BTN_A) { this.events.BTN_A = false; return true; } return false; }
      if (which === "B") { if (this.events.BTN_B) { this.events.BTN_B = false; return true; } return false; }
      if (this.events.BTN_A || this.events.BTN_B) { this.events.BTN_A = false; this.events.BTN_B = false; return true; }
      return false;
    }

    buttonPressedQ(args) {
      const which = String(args.BTN);
      if (which === "A") return !!this.state.BA;
      if (which === "B") return !!this.state.BB;
      return false;
    }

    whenMoved() {
      if (this.events.MOVE) { this.events.MOVE = false; return true; }
      return false;
    }

    async displayMatrix(args) {
      if (!this.port) return;
      await this._sendLine("CMD MATRIX " + String(args.PATTERN));
    }

    async displayText(args) {
      if (!this.port) return;
      await this._sendLine("CMD TEXT " + String(args.TEXT));
    }

    async clearDisplay() {
      if (!this.port) return;
      await this._sendLine("CMD CLEAR");
    }

    whenTilted(args) {
      const dir = String(args.DIR);
      if (dir === "any") { if (this.events.TILT_any) { this.events.TILT_any = false; return true; } return false; }
      const key = "TILT_" + dir;
      if (this.events[key]) { this.events[key] = false; return true; }
      return false;
    }

    tiltedQ(args) {
      const dir = String(args.DIR);
      if (dir === "any") return this.state.TILT !== "none";
      return this.state.TILT === dir;
    }

    tiltAngle(args) {
      const dir = String(args.DIR);
      if (dir === "front") return this.state.PITCH;
      if (dir === "back") return -this.state.PITCH;
      if (dir === "left") return -this.state.ROLL;
      if (dir === "right") return this.state.ROLL;
      return 0;
    }

    whenPinConnected(args) {
      const pin = String(args.PIN);
      const key = "PIN_" + pin;
      if (this.events[key]) { this.events[key] = false; return true; }
      return false;
    }
  }

  Scratch.extensions.register(new MicrobitSerial());
})(Scratch);
