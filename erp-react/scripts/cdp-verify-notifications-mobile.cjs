/* Mobile responsive check for the premium Notifications page.
 * Emulates a 390px-wide phone: cards use full width, no horizontal scroll,
 * centered container collapses to full width, layout stays intact.
 */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, evalJs, shot } = helpers;
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    await cdp.send('Runtime.enable');

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    await navigate('http://localhost:5173/notifications');
    await sleep(3000);

    const out = await evalJs(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 25; i++) {
        if (!document.querySelector('.animate-spin')) break;
        await sleep(200);
      }
      const card = document.querySelector('ul.space-y-3 > li > button');
      const container = card ? card.parentElement : null;
      const main = document.querySelector('main');
      return {
        viewport: window.innerWidth,
        bodyScrollWidth: document.documentElement.scrollWidth,
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        cardWidth: card ? card.getBoundingClientRect().width : null,
        cardFullWidth: card ? Math.abs(card.getBoundingClientRect().width - (main ? main.clientWidth : window.innerWidth)) < 40 : false,
        headerVisible: !!document.querySelector('h1'),
        cards: document.querySelectorAll('ul.space-y-3 > li > button').length
      };
    })()`);
    await shot('notifications-mobile');

    await cdp.send('Emulation.clearDeviceMetricsOverride');
    console.log(JSON.stringify({ mobile: out, errors }, null, 2));
  }
};