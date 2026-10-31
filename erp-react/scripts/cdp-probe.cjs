module.exports = { run: async ({ cdp, sleep, helpers }) => {
  const { evalJs } = helpers;
  const info = await evalJs(`(() => {
    const le = (k) => { try { return localStorage.getItem(k); } catch(e) { return 'ERR'; } };
    return {
      url: location.href,
      auth: !!le('authToken'),
      tokenLen: (le('authToken') || '').length
    };
  })()`);
  console.log('PROBE: ' + JSON.stringify(info));
}};
