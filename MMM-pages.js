Module.register('MMM-pages', {

  /**
   * By default, we have don't pseudo-paginate any modules. We also exclude
   * the page indicator by default, in case people actually want to use the
   * sister module. We also don't rotate out modules by default.
   */

  defaults: {
    modules: [],
    excludes: [], // Keep for compatibility
    fixed: ['MMM-page-indicator'],
    hiddenPages: {},
    animationTime: 1000,
    rotationTime: 0,
    rotationFirstPage: 0, // Keep for compatibility
    rotationHomePage: 0,
    rotationDelay: 10000,
    homePage: 0,
    useLockString: true,
    pageTimeout: []
  },
  inactive: false,
  active: true,
  nodelay: 0,
  savedLastPage: 0,
  timer: null,
  /**
   * Apply any styles, if we have any.
   */
  getStyles() {
    return ['pages.css'];
  },

  /**
   * Modulo that also works with negative numbers.
   *
   * @param {number} x The dividend
   * @param {number} n The divisor
   */
  mod(x, n) {
    return ((x % n) + n) % n;
  },

  /**
   * Pseudo-constructor for our module. Makes sure that values aren't negative,
   * and sets the default current page to 0.
   */
  start() {
    // Clamp homePage value to [0, num pages).
    if (this.config.homePage >= this.config.modules.length || this.config.homePage < 0) {
      this.config.homePage = 0;
    }
    this.curPage = this.config.homePage;
    this.rotationState = this.inactive;

    // Compatibility
    if (this.config.excludes.length) {
      Log.warn('[MMM-pages] The config option "excludes" is deprecated. Please use "fixed" instead.');
      this.config.fixed = this.config.excludes;
    }

    if (this.config.rotationFirstPage) {
      Log.warn('[MMM-pages] The config option "rotationFirstPage" is deprecated. Please used "rotationHomePage" instead.');
      this.config.rotationHomePage = this.config.rotationFirstPage;
    }

    // Disable rotation if an invalid input is given
    this.config.rotationTime = Math.max(this.config.rotationTime, 0);
    this.config.rotationDelay = Math.max(this.config.rotationDelay, 0);
    this.config.rotationHomePage = Math.max(this.config.rotationHomePage, 0);

    if (!this.config.useLockString) {
      Log.log('[MMM-pages] User opted to not use lock strings!');
    }
  },

  /**
   * Handles incoming notifications. Responds to the following:
   *   'PAGE_CHANGED' - Set the page to the specified payload page.
   *   'PAGE_INCREMENT' - Move to the next page.
   *   'PAGE_DECREMENT' - Move to the previous page.
   *   'DOM_OBJECTS_CREATED' - Starts the module.
   *   'QUERY_PAGE_NUMBER' - Requests the current page number
   *   'PAUSE_ROTATION' - Stops rotation
   *   'RESUME_ROTATION' - Resumes rotation
   *   'HOME_PAGE' - Calls PAGED_CHANGED with the default home page.
   *   'SHOW_HIDDEN_PAGE' - Shows the (in the payload) specified hidden
   *                        page by name
   *   'LEAVE_HIDDEN_PAGE' - Hides the currently showing hidden page and
   *                         resumes showing the last page
   *
   * @param {string} notification the notification ID
   * @param {number|string} payload the page to change to/by
   */
  notificationReceived(notification, payload) {
    switch (notification) {
      case 'PAGE_CHANGED':
        Log.log(`[MMM-pages] received a notification to change to page ${payload} of type ${typeof payload}.`);
        this.savedLastPage = this.curPage;
        this.curPage = payload;
        this.updatePages();
        break;
      case 'PAGE_INCREMENT':
        Log.log('[MMM-pages] received a notification to increment pages!');
        this.changePageBy(payload, 1);
        this.updatePages();
        break;
      case 'PAGE_DECREMENT':
        Log.log('[MMM-pages] received a notification to decrement pages!');
        // We can't just pass in -payload for situations where payload is null
        // JS will coerce -payload to -0.
        this.changePageBy(payload ? -payload : payload, -1);
        this.updatePages();
        break;
      case 'DOM_OBJECTS_CREATED':
        Log.log('[MMM-pages] received that all objects are created; will now hide things!');
        this.setRotation(true);
        this.sendNotification('MAX_PAGES_CHANGED', this.config.modules.length);
        this.sendNotification('NEW_PAGE', this.curPage);
        this.animatePageChange();
        this.resetTimerWithDelay(this.nodelay);
        break;
      case 'QUERY_PAGE_NUMBER':
        this.sendNotification('PAGE_NUMBER_IS', this.curPage);
        break;
      case 'PAUSE_ROTATION':
        this.setRotation(this.inactive);
        break;
      case 'RESUME_ROTATION':
        this.setRotation(this.active);
        break;
      case 'HOME_PAGE':
        this.notificationReceived('PAGE_CHANGED', this.config.homePage);
        break;
      case 'SHOW_HIDDEN_PAGE':
        Log.log(`[MMM-pages] received a notification to change to the hidden page "${payload}" of type "${typeof payload}".`);
        this.setRotation(false);
        this.showHiddenPage(payload);
        break;
      case 'LEAVE_HIDDEN_PAGE':
        Log.log('[MMM-pages] received a notification to leave the current hidden page.');
        this.animatePageChange();
        this.setRotation(true);
        break;
      default: // Do nothing
    }
  },

  /**
   * Changes the internal page number by the specified amount. If the provided
   * amount is invalid, use the fallback amount. If the fallback amount is
   * missing or invalid, do nothing.
   *
   * @param {number} amt the amount of pages to move forward by. Accepts
   * negative numbers.
   * @param {number} fallback the fallback value to use. Accepts negative
   * numbers.
   */
  changePageBy(amt, fallback) {
    if (typeof amt !== 'number' && typeof fallback === 'undefined') {
      Log.warn(`[MMM-pages] ${amt} is not a number!`);
    }

    if (typeof amt === 'number' && !Number.isNaN(amt)) {
      this.curPage = this.mod(
        this.curPage + amt,
        this.config.modules.length
      );
    } else if (typeof fallback === 'number') {
      this.curPage = this.mod(
        this.curPage + fallback,
        this.config.modules.length
      );
    }
  },
  // checks if a string is numeric characters only
  isNumeric(str) {
    return /^\d+$/.test(str);
  },
  /**
   * Handles hiding the current page's elements and showing the next page's
   * elements.
   */
  updatePages() {
    // Update if there's at least one page.
    if (this.config.modules.length !== 0) {
      if (typeof this.curPage !== 'string' || (this.isNumeric(this.curPage))) {
        if (parseInt(this.curPage) < this.config.modules.length) {
          this.animatePageChange();
          if (this.rotationState == this.inactive) {
            this.resetTimerWithDelay(this.nodelay);
          }
          this.sendNotification('NEW_PAGE', this.curPage);
        } else {
          Log.error(`[MMM-pages] cannot change to page number ${this.curPage}, out of range`);
        }
      } else {
        Log.error(`[MMM-pages] cannot change to a named page ${this.curPage}'`);
        this.curPage = this.savedLastPage;
      }
    } else { Log.error('[MMM-pages] Pages are not properly defined!'); }
  },

  /**
   * Animates the page change from the previous page to the current one. This
   * assumes that there is a discrepancy between the page currently being shown
   * and the page that is meant to be shown.
   *
   * @param {string} [targetPageName] the name of the hiddenPage we want to show.
   * Optional and only used when we want to switch to a hidden page
   */
  animatePageChange(targetPageName) {
    let lockStringObj = { lockString: this.identifier };
    if (!this.config.useLockString) {
      // Passing in an undefined object is equivalent to not passing it in at
      // all, effectively providing only one arg to the hide and show calls
      lockStringObj = undefined;
    }

    // Hides all modules not on the current page. This hides any module not
    // meant to be shown.

    const self = this;
    let modulesToShow;
    if (typeof targetPageName !== 'undefined') {
      modulesToShow = this.config.hiddenPages[targetPageName];
    } else {
      modulesToShow = this.config.fixed.concat(this.config.modules[this.curPage]);
    }
    const animationTime = self.config.animationTime / 2;

    MM.getModules()
      .exceptWithClass(modulesToShow)
      .enumerate(module => module.hide(animationTime, () => {}, lockStringObj));

    // Shows all modules meant to be on the current page, after a small delay.
    setTimeout(() => {
      MM.getModules()
        .withClass(modulesToShow)
        .enumerate(module => module.show(animationTime, () => {}, lockStringObj));
    }, animationTime);
  },

  /**
   * Resets the page changing timer with a delay.
   *
   * @param {number} delay the delay, in milliseconds.
   */
  resetTimerWithDelay(delay) {
    if (this.config.rotationTime > 0) {
      // This timer is the auto rotate function.
      if (this.timer) {
        (this.config.pageTimeout.length ? clearTimeout : clearInterval)(this.timer);
        this.timer = null;
      }
      // This is delay timer after manually updating.
      if (this.delayTimer) {
        clearTimeout(this.delayTimer);
        this.delayTimer = null;
      }
      let rotationTimeout = this.config.rotationTime;
      if (this.config.pageTimeout.length) {
        for (let pageInfo of this.config.pageTimeout) {
          if ((pageInfo.pageNumber) - 1 == this.curPage) {
            rotationTimeout = pageInfo.timeout;
            break;
          }
        }
      }
      const self = this;
      this.rotationState = this.active;
      this.delayTimer = setTimeout(() => {
        self.timer = (this.config.pageTimeout.length ? setTimeout : setInterval)(() => {
          // Inform other modules and page change.
          // MagicMirror automatically excludes the sender from receiving the
          // message, so we need to trigger it for ourselves.
          self.sendNotification('PAGE_INCREMENT');
          self.notificationReceived('PAGE_INCREMENT');
        }, rotationTimeout);
      }, delay, this);
    } else if (this.config.rotationHomePage > 0) {
      // This timer is the auto rotate function.
      if (this.timer) {
        (this.config.pageTimeout.length ? clearTimeout : clearInterval)(this.timer);
        this.timer = null;
      }
      // This is delay timer after manually updating.
      if (this.delayTimer) {
        clearTimeout(this.delayTimer);
        this.delayTimer = null;
      }
      let rotationTimeout = this.config.rotationHomePage;
      if (this.config.pageTimeout.length) {
        for (let pageInfo of this.config.pageTimeout) {
          if ((pageInfo.pagenumber) - 1 == this.curPage) {
            rotationTimeout = pageInfo.timeout;
            break;
          }
        }
      }
      const self = this;
      this.rotationState = this.active;
      Log.log(`[MMM-pages] resuming rotation 2`);
      this.delayTimer = setTimeout(() => {
        this.delayTimer = null;
        self.timer = (this.config.pageTimeout.length ? setTimeout : setInterval)(() => {
          // Inform other modules and page change.
          // MagicMirror automatically excludes the sender from receiving the
          // message, so we need to trigger it for ourselves.
          self.sendNotification('PAGE_CHANGED', 0);
          self.notificationReceived('PAGE_CHANGED', self.config.homePage);
        }, rotationTimeout);
      }, delay);
    }
  },

  /**
   * Pause or resume the page rotation. If the provided isRotating value is
   * set to true, it will resume the rotation. If the requested
   * state (f.e. isRotating === true) equals the current state, print a warning
   * and do nothing.
   *
   * @param {boolean} newState parameter, if you want to pause or resume.
   */
  setRotation(newState) {
    const stateBaseString = newState ? 'resum' : 'paus';
    if (newState === this.rotationState) {
      Log.warn(`[MMM-pages] was asked to ${stateBaseString}e but rotation is already ${stateBaseString}ed!`);
    } else {
      Log.log(`[MMM-pages] ${stateBaseString}ing rotation`);
      if (newState === this.inactive) {
        if (this.timer) {
          (this.config.pageTimeout.length ? clearTimeout : clearInterval)(this.timer);
          this.timer = null;
        }
        if (this.delayTimer) {
          clearTimeout(this.delayTimer);
          this.delayTimer = null;
        }
      } else {
        this.resetTimerWithDelay(this.rotationDelay);
      }
      this.rotationState = newState;
    }
  },

  /**
   * Handles hidden pages.
   *
   * @param {string} name the name of the hiddenPage we want to show
   */
  showHiddenPage(name) {
    // Only proceed if the named hidden page actually exists
    if (name in this.config.hiddenPages) {
      this.animatePageChange(name);
    } else {
      Log.error(`[MMM-pages] Hidden page "${name}" does not exist!`);
    }
  },
});
