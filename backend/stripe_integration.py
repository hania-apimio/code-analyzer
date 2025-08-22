import os
import stripe
import requests
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from pymongo import MongoClient


CLERK_API_BASE = "https://api.clerk.com/v1"

# Initialize Stripe with environment key (no hardcoded fallback)
_stripe_key = os.getenv("STRIPE_SECRET_KEY")
if not _stripe_key:
    raise RuntimeError(
        "STRIPE_SECRET_KEY environment variable is not set. Set a valid test or live secret key (starts with 'sk_')."
    )
stripe.api_key = _stripe_key

class StripeManager:
    def __init__(self):
        self.stripe = stripe
    
    def _get_clerk_metadata(self, user_id: str) -> Dict[str, Any]:
        """
        Get private metadata from Clerk for a user
        
        Args:
            user_id: The Clerk user ID
            
        Returns:
            Dict containing the user's private metadata
        """
        clerk_secret = os.getenv("CLERK_SECRET_KEY")
        if not clerk_secret:
            raise Exception("CLERK_SECRET_KEY not configured")
            
        headers = {
            "Authorization": f"Bearer {clerk_secret}",
            "Content-Type": "application/json",
        }
        
        try:
            # Get user data from Clerk
            user_url  = f"{CLERK_API_BASE}/users/{user_id}"
            user_resp = requests.get(user_url, headers=headers)
            user_resp.raise_for_status()
            user_data = user_resp.json()
            
            # Return private metadata (or empty dict if none exists)
            return user_data.get("private_metadata", {}) or {}
            
        except requests.exceptions.RequestException as e:
            error_detail = str(e)
            if hasattr(e, 'response') and e.response is not None:
                error_detail = e.response.text
            raise Exception(f"Failed to get Clerk metadata: {error_detail}")
    
    def create_premium_checkout_session(self, customer_email: str, user_id: str, success_url: str, cancel_url: str) -> Dict[str, Any]:
        """
        Create a checkout session for premium subscription
        
        Args:
            user_id: The Clerk user ID
            customer_email: The user's email address
            success_url: URL to redirect to after successful checkout
            cancel_url: URL to redirect to if checkout is cancelled
            
        Returns:
            Dict containing session details or error information
        """
        try:
            customer_id = None
            
            # First, try to get existing customer ID from Clerk metadata
            try:
                private_metadata = self._get_clerk_metadata(user_id)
                customer_id = private_metadata.get("stripe_customer_id")
                
                # Verify the customer exists in Stripe
                if customer_id:
                    print(f"Found existing Stripe customer ID in Clerk metadata: {customer_id}")
                    try:
                        customer = stripe.Customer.retrieve(customer_id)
                        print(f"Verified Stripe customer exists: {customer.id} (Email: {customer.email})")
                    except stripe.error.InvalidRequestError:
                        # Customer doesn't exist in Stripe, will create a new one
                        print(f"Customer {customer_id} not found in Stripe, will create a new one")
                        customer_id = None
                        
            except Exception as e:
                print(f"Warning: Could not check Clerk metadata: {str(e)}")
                # Continue with customer creation if we can't check metadata
            
            # If no valid customer ID found, create a new customer
            if not customer_id:
                customer = stripe.Customer.create(
                    email=customer_email,
                    metadata={"user_id": user_id}
                )
                customer_id = customer.id
                print(f"Created new Stripe customer: {customer_id} (Email: {customer.email})")
                print(f"This customer ID will be stored in Clerk's private metadata after checkout completion")
            
            print(f"Creating checkout session for customer ID: {customer_id}")
            # Create checkout session for premium subscription
            
            session = stripe.checkout.Session.create(
                customer=customer_id,
                payment_method_types=['card'],
                line_items=[{
                    'price_data': {
                        'currency': 'usd',
                        'product_data': {
                            'name': 'Starter Pack',
                            'description': 'Starter plan with core integrations.',
                        },
                        'unit_amount': 1999,  # $19.99 in cents
                        'recurring': {
                            'interval': 'month',
                        },
                    },
                    'quantity': 1,
                }],
                mode='subscription',
                success_url=success_url,
                cancel_url=cancel_url,
                allow_promotion_codes=True,
                billing_address_collection='required',
                metadata={
                    'user_id': user_id,
                    'customer_email': customer_email,
                    'product_type': 'starter_subscription'
                },
                # Enable test mode features
                payment_method_options={
                    'card': {
                        'request_three_d_secure': 'automatic'
                    }
                }
            )
            
            return {
                "success": True,
                "session_id": session.id,
                "checkout_url": session.url,
                "customer_id": customer.id
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_subscription_status(self, customer_email: str) -> Dict[str, Any]:
        """
        Get subscription status for a customer
        """
        try:
            customers = stripe.Customer.list(email=customer_email, limit=1)
            if not customers.data:
                return {"has_subscription": False, "status": "no_customer"}
            
            customer = customers.data[0]
            subscriptions = stripe.Subscription.list(customer=customer.id, limit=1)
            
            if subscriptions.data:
                subscription = subscriptions.data[0]
                return {
                    "has_subscription": True,
                    "status": subscription.status,
                    "subscription_id": subscription.id,
                    "current_period_end": subscription.current_period_end
                }
            else:
                return {"has_subscription": False, "status": "no_subscription"}
                
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_next_payment_due(self, customer_email: str) -> Dict[str, Any]:
        """
        Get the next payment due date for a customer's subscription
        """
        try:
            status = self.get_subscription_status(customer_email)
            if not status.get("has_subscription"):
                return {"success": False, "error": "No active subscription found"}
            
            # Calculate next payment date (1 month after current period end)
            current_period_end = status.get("current_period_end")
            if current_period_end:
                # Convert timestamp to datetime
                from datetime import datetime
                next_payment_date = datetime.fromtimestamp(current_period_end)
                return {
                    "success": True,
                    "next_payment_due": next_payment_date.isoformat(),
                    "current_period_end": current_period_end
                }
            else:
                return {"success": False, "error": "Unable to determine next payment date"}
                
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def cancel_subscription(self, customer_email: str) -> Dict[str, Any]:
        """
        Cancel a customer's subscription in Stripe
        
        Args:
            customer_email: The customer's email address
            
        Returns:
            Dict containing success status and message/error
        """
        try:
            # First, find the customer by email
            customers = stripe.Customer.list(email=customer_email, limit=1)
            if not customers.data:
                return {
                    'success': False,
                    'error': 'No customer found with that email'
                }
                
            customer = customers.data[0]
            
            # Find active subscriptions
            subscriptions = stripe.Subscription.list(
                customer=customer.id,
                status='active',
                limit=1
            )
            
            if not subscriptions.data:
                return {
                    'success': False,
                    'error': 'No active subscription found for this customer'
                }
                
            # Cancel the subscription at period end
            subscription = subscriptions.data[0]
            cancelled_subscription = stripe.Subscription.modify(
                subscription.id,
                cancel_at_period_end=True
            )
            
            # Format the current_period_end as a Unix timestamp
            current_period_end = cancelled_subscription.get('current_period_end')
            if current_period_end:
                current_period_end = datetime.fromtimestamp(current_period_end).isoformat()
            
            return {
                'success': True,
                'message': 'Subscription will be cancelled at the end of the current billing period',
                'subscription_id': cancelled_subscription.id,
                'cancel_at_period_end': cancelled_subscription.cancel_at_period_end,
                'current_period_end': current_period_end
            }
            
        except stripe.error.StripeError as e:
            return {
                'success': False,
                'error': f'Stripe error: {str(e)}',
                'details': str(e)
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Error cancelling subscription: {str(e)}',
                'details': str(e)
            }
    
    def get_payment_method_details(self, customer_id: str) -> Optional[Dict[str, Any]]:
        """
        Get payment method details for a customer
        
        Args:
            customer_id: Stripe customer ID
            
        Returns:
            Dict containing payment method details or None if not found
        """
        try:
            # List all payment methods for the customer
            payment_methods = stripe.PaymentMethod.list(
                customer=customer_id,
                type="card"
            )
            
            if not payment_methods.data:
                return None
                
            # Get the default payment method or the first one
            payment_method = payment_methods.data[0]
            
            # Extract relevant card details
            card = payment_method.card
            return {
                "brand": card.brand,
                "last4": card.last4,
                "exp_month": card.exp_month,
                "exp_year": card.exp_year,
                "country": card.country,
                "payment_method_id": payment_method.id
            }
            
        except stripe.error.StripeError as e:
            print(f"Error fetching payment method: {str(e)}")
            return None
            
    def get_customer_payment_methods(self, user_id: str) -> Dict[str, Any]:
        """
        Get payment methods for a user by their Clerk user ID
        
        Args:
            user_id: Clerk user ID
            
        Returns:
            Dict containing payment methods or error information
        """
        try:
            # Get customer ID from Clerk's private metadata
            private_metadata = self._get_clerk_metadata(user_id)
            customer_id = private_metadata.get("stripe_customer_id")
            print("Customer ID: ", customer_id)
           
            if not customer_id:
                print(f"No Stripe customer ID found in Clerk metadata for user {user_id}")
                return {
                    "success": True, 
                    "has_payment_method": False, 
                    "message": "No payment methods found",
                    "customer_id": None
                }
                
            print(f"Using Stripe customer ID from Clerk metadata: {customer_id}")
                
            # Get payment methods
            payment_methods = stripe.PaymentMethod.list(
                customer=customer_id,
                type="card"
            )
            
            if not payment_methods.data:
                print("No payment methods found for customer")
                return {
                    "success": True, 
                    "has_payment_method": False, 
                    "message": "No payment methods found",
                    "customer_id": customer_id
                }
                
            print(f"Found {len(payment_methods.data)} payment methods")
                
            # Format payment methods
            cards = []
            for pm in payment_methods.data:
                if pm.type == 'card':
                    card = pm.card
                    card_data = {
                        "id": pm.id,
                        "brand": card.brand,
                        "last4": card.last4,
                        "exp_month": card.exp_month,
                        "exp_year": card.exp_year,
                        "is_default": pm.id == payment_methods.data[0].id  # First one is default
                    }
                    print(f"Found card: {card_data}")
                    cards.append(card_data)
            
            return {
                "success": True,
                "has_payment_method": True,
                "cards": cards,
                "customer_id": customer_id
            }
            
        except stripe.error.StripeError as e:
            return {"success": False, "error": f"Stripe error: {str(e)}"}
        except Exception as e:
            return {"success": False, "error": f"Failed to fetch payment methods: {str(e)}"}
    
    def get_or_create_customer_by_email(self, email: str) -> Optional[str]:
        """Return a Stripe customer ID for the given email, creating one if needed."""
        try:
            customers = stripe.Customer.list(email=email, limit=1)
            if customers.data:
                return customers.data[0].id
            customer = stripe.Customer.create(email=email)
            return customer.id
        except Exception as e:
            print(f"Error getting/creating customer: {e}")
            return None

    def create_billing_portal_session(self, customer_id: str, return_url: str) -> Dict[str, Any]:
        """Create a Stripe Billing Portal session for the customer to manage payment methods."""
        try:
            session = stripe.billing_portal.Session.create(
                customer=customer_id,
                return_url=return_url,
            )
            return {"success": True, "url": session.url}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def delete_customer(self, user_id: str) -> Dict[str, Any]:
        """
        Delete a customer from Stripe using the customer ID stored in Clerk's private metadata
        
        Args:
            user_id: The Clerk user ID
            
        Returns:
            Dict containing success status and message/error
        """
        try:
            # Get the customer ID from Clerk private metadata
            metadata = self._get_clerk_metadata(user_id)
            customer_id = metadata.get('stripe_customer_id')
            print("CUSTOMER ID: ", customer_id)
            if not customer_id:
                return {
                    'success': False,
                    'error': 'No Stripe customer ID found in user metadata',
                    'deleted': False
                }
            
            # Delete the customer from Stripe
            deleted_customer = stripe.Customer.delete(customer_id)
            
            if not deleted_customer.deleted:
                return {
                    'success': False,
                    'error': 'Failed to delete customer',
                    'deleted': False
                }
                
            return {
                'success': True,
                'message': 'Customer deleted successfully',
                'deleted': True,
                'customer_id': customer_id
            }
            
        except stripe.error.StripeError as e:
            return {
                'success': False,
                'error': f'Stripe error: {str(e)}',
                'deleted': False
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Error deleting customer: {str(e)}',
                'deleted': False
            }
           