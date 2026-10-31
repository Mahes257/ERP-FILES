module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;

    await navigate('http://localhost:5173/payment-receipts/7/edit');
    await sleep(3000);

    const formState = await evalJs(`(() => ({
      clientInput: (document.querySelector('input[autocomplete="off"]')?.value || '').slice(0, 40),
      amount: [...document.querySelectorAll('input[type="number"]')].map((i) => i.value),
      selects: [...document.querySelectorAll('select')].map((s) => s.value)
    }))()`);
    console.log('FORM_STATE: ' + JSON.stringify(formState));

    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('.sticky button')].find((b) => /Update/i.test(b.textContent || ''));
      if (btn) btn.click();
      return !!btn;
    })()`);
    await sleep(1800);

    // Toasts render as fixed overlay text
    const toastText = await evalJs(`(() => {
      const candidates = [...document.querySelectorAll('[class*="toast"], [role="alert"], .fixed, .absolute')]
        .filter((e) => /(please|required|failed|error|valid|enter|select)/i.test(e.textContent || '') && e.offsetHeight > 0 && e.offsetHeight < 200)
        .map((e) => e.textContent.replace(/\\s+/g, ' ').trim().slice(0, 120));
      return [...new Set(candidates)].slice(0, 4);
    })()`);
    console.log('TOAST_TEXT: ' + JSON.stringify(toastText));
    console.log('TOAST_DONE');
  }
};
