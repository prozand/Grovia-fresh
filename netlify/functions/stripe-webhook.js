const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // 1. Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let stripeEvent;

  try {
    // 2. Verify the event actually came from Stripe
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook Signature Error: ${err.message}`);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // 3. Handle the successful payment
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const farmId = session.client_reference_id;

    if (farmId) {
      console.log(`Payment successful! Activating farm ID: ${farmId}`);

      // 4. Connect to Supabase using your Service Role Key
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // 5. Tell Supabase to change Active to true
      const { error } = await supabase
        .from('farms')
        .update({ Active: true })
        .eq('id', farmId);

      if (error) {
        console.error('Error updating Supabase:', error.message);
        return { statusCode: 500, body: 'Error updating database' };
      }
      
      console.log('Successfully updated farm in Supabase.');
    } else {
      console.log('Payment succeeded, but no Farm ID was attached.');
    }
  }

  // 6. Return a real 200 OK to Stripe
  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
