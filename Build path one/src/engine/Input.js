export class InputManager {
  constructor() {
    this.keys = {};
    this.actionQueue = [];

    // Touch gesture tracking
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
    this.minSwipeDistance = 35; // Minimum px for swipe detection

    this.initKeyboardListeners();
    this.initTouchListeners();
  }

  initKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      // Prevent scrolling
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      const key = e.key.toLowerCase();
      if (!this.keys[key]) {
        this.keys[key] = true;
        this.handleKeyDown(key);
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      this.keys[key] = false;
    });
  }

  handleKeyDown(key) {
    if (key === 'a' || key === 'arrowleft') {
      this.actionQueue.push('LEFT');
    } else if (key === 'd' || key === 'arrowright') {
      this.actionQueue.push('RIGHT');
    } else if (key === 'w' || key === 'arrowup' || key === ' ') {
      this.actionQueue.push('JUMP');
    } else if (key === 's' || key === 'arrowdown') {
      this.actionQueue.push('SLIDE');
    } else if (key === 'shift') {
      this.actionQueue.push('BRAKE');
    }
  }

  initTouchListeners() {
    // Touch events for mobile/tablet
    window.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.touchStartTime = performance.now();
      }
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      if (e.changedTouches.length > 0) {
        const deltaX = e.changedTouches[0].clientX - this.touchStartX;
        const deltaY = e.changedTouches[0].clientY - this.touchStartY;
        const elapsed = performance.now() - this.touchStartTime;

        if (elapsed < 600) { // Fast flick
          this.processGesture(deltaX, deltaY);
        }
      }
    }, { passive: true });

    // Mouse drag gesture support (for browser testing)
    let isMouseDown = false;
    let mouseStartX = 0;
    let mouseStartY = 0;

    window.addEventListener('mousedown', (e) => {
      // Only track if clicking on canvas or not interactive elements
      if (e.target.tagName !== 'BUTTON' && !e.target.closest('.char-card')) {
        isMouseDown = true;
        mouseStartX = e.clientX;
        mouseStartY = e.clientY;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (isMouseDown) {
        isMouseDown = false;
        const deltaX = e.clientX - mouseStartX;
        const deltaY = e.clientY - mouseStartY;
        this.processGesture(deltaX, deltaY);
      }
    });
  }

  processGesture(deltaX, deltaY) {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX > absY && absX > this.minSwipeDistance) {
      if (deltaX < 0) {
        this.actionQueue.push('LEFT');
      } else {
        this.actionQueue.push('RIGHT');
      }
    } else if (absY > absX && absY > this.minSwipeDistance) {
      if (deltaY < 0) {
        this.actionQueue.push('JUMP');
      } else {
        this.actionQueue.push('SLIDE');
      }
    }
  }

  consumeAction() {
    return this.actionQueue.shift() || null;
  }

  clear() {
    this.actionQueue = [];
  }
}
