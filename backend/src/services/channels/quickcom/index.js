module.exports = {
  BlinkitAdapter:          require('./blinkit'),
  SwiggyInstamartAdapter:  require('./swiggy-instamart'),
  BBNowAdapter:            require('./bb-now'),
  ...require('./pending'),
};
