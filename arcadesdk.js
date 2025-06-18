// This code i wrote is based on ScratchX Documentation And Examples
// May not work fully

(function() {
  var ext = {};

  // Internal state
  let userPoints = 0;
  let pointsPerTicket = 7;
  let ticketCount = 0;

  // ScratchX lifecycle
  ext._shutdown = function() {};
  ext._getStatus = function() {
    return { status: 2, msg: 'Coding Arcade SDK Ready' };
  };

  // Set total points
  ext.set_points = function(p) {
    userPoints = parseInt(p) || 0;
  };

  // Points per ticket
  ext.set_points_per_ticket = function(ppt) {
    pointsPerTicket = parseInt(ppt) || 1;
  };

  // figure shit out i guess
  ext.calculate_tickets = function() {
    if (pointsPerTicket > 0) {
      ticketCount = Math.floor(userPoints / pointsPerTicket);
    } else {
      ticketCount = 0;
    }
  };

  // this might break
  ext.get_ticket_result = function() {
    if (ticketCount >= 1) {
      return `You Earned ${ticketCount} Ticket${ticketCount === 1 ? '' : 's'}!`;
    } else {
      return `Better Luck Next Time\nYou don't have enough points.`;
    }
  };

  // Show Toast Animation. this is copied from the turbowarp toast plugin
  ext.show_toast = function(callback) {
    const toast = document.createElement('div');

    // Set content
    toast.innerHTML = (ticketCount >= 1)
      ? `<div style="font-size: 24px; font-weight: 500;">You Won:</div>
         <div style="font-size: 72px; font-weight: bold;">${ticketCount}</div>
         <div style="font-size: 24px;">Tickets</div>`
      : `<div style="font-size: 36px; font-weight: bold;">Better Luck Next Time</div>
         <div style="font-size: 20px;">You don't have enough points</div>`;

    // Style the toast
    Object.assign(toast.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: '#fff',
      color: '#000',
      border: '2px solid #000',
      padding: '32px',
      borderRadius: '20px',
      textAlign: 'center',
      boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
      zIndex: 9999,
      opacity: '0',
      transition: 'opacity 0.5s ease',
      fontFamily: 'Arial, sans-serif',
      lineHeight: '1.4',
    });

    // Add to DOM
    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => {
      toast.style.opacity = '1';
    }, 50);

    // Animate out and cleanup
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast && toast.parentNode) {
          toast.remove();
        }
        if (typeof callback === 'function') {
          callback(); // notify Scratch it's done
        }
      }, 500);
    }, 3000);
  };

  // blcoks and stuff
  var descriptor = {
    blocks: [
      [' ', 'set total points to %n', 'set_points', 0],
      [' ', 'set points per ticket to %n', 'set_points_per_ticket', 7],
      [' ', 'calculate tickets', 'calculate_tickets'],
      ['r', 'get ticket result', 'get_ticket_result'],
      ['w', 'show toast animation', 'show_toast']
    ],
    name: 'Coding Arcade SDK',
    url: 'https://centralschool.fun'
  };

  ScratchExtensions.register('Coding Arcade SDK', descriptor, ext);
})();
