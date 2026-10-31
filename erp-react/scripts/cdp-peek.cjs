module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;
    await navigate('http://localhost:5173/quotations');
    await sleep(4000);
    const info = await evalJs(`(() => ({ url: location.href, title: document.title, body: (document.body.innerText || '').slice(0, 200) }))()`);
    console.log('PEEK: ' + JSON.stringify(info));
    console.log('CDP_SCRIPT_DONE');
  }
};
