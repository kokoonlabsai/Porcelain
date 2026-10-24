/** Razorpay checkout in the browser: shop payments and booking deposits. */
/** Loads Razorpay's checkout script once, on demand. */
let razorpayScript;
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  razorpayScript ||= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://checkout.razorpay.com/v1/checkout.js';
    el.onload = () => resolve();
    el.onerror = () => { razorpayScript = null; reject(new Error('Couldn’t load the payment window. Check your connection and try again.')); };
    document.body.appendChild(el);
  });
  return razorpayScript;
}

/** Opens Razorpay's window; resolves with the signed result, or null if the customer closed it. */
export function payWithRazorpay(rzp) {
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: rzp.key,
      order_id: rzp.order_id,
      amount: rzp.amount,
      currency: rzp.currency,
      name: rzp.name,
      description: rzp.description,
      prefill: rzp.prefill,
      theme: { color: '#1F3264' },
      handler: (result) => resolve(result),
      modal: { ondismiss: () => resolve(null), confirm_close: true },
    });
    checkout.on('payment.failed', () => { /* Razorpay shows the error and lets them retry inside the window. */ });
    try { checkout.open(); } catch (e) { reject(e); }
  });
}
