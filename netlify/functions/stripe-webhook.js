const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let stripeEvent;
  let body = event.body;
  if (event.isBase64Encoded) {
    body = Buffer.from(event.body, 'base64').toString('utf8');
  }

  try {
    stripeEvent = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook Error:', err.message);
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`,
    };
  }

  // Handle the checkout.session.completed event
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    
    const farmId = session.client_reference_id;

    if (farmId) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data, error } = await supabase
        .from('farms')
        .update({ Active: true })
        .eq('id', farmId);
        
      if (error) {
        console.error('Error updating Supabase:', error);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to update database' })
        };
      }
      
      console.log(`Successfully activated farm ID: ${farmId}`);
    } else {
      console.log('No client_reference_id found in the session');
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
