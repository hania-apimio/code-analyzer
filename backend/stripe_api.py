from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse
import jwt
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os
import requests
from pydantic import BaseModel
from stripe_integration import StripeManager
import stripe
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

router = APIRouter()

# Validate required environment variables
required_env_vars = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "CLERK_SECRET_KEY",
    "VITE_API_URL"
]

missing_vars = [var for var in required_env_vars if not os.getenv(var)]
if missing_vars:
    raise RuntimeError(f"Missing required environment variables: {', '.join(missing_vars)}")

# Initialize Stripe with API key
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
stripe_webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
CLERK_API_BASE = os.getenv("CLERK_API_BASE", "https://api.clerk.com/v1")
API_BASE_URL = os.getenv("VITE_API_URL").strip()

# Initialize Stripe manager
stripe_manager = StripeManager()

class CheckoutSessionRequest(BaseModel):
    customer_email: str
    user_id: str
    success_url: str
    cancel_url: str

class SubscriptionStatusRequest(BaseModel):
    customer_email: str

class CancelSubscriptionRequest(BaseModel):
    customer_email: str

class NextPaymentRequest(BaseModel):
    customer_email: str

class DeletePaymentMethodRequest(BaseModel):
    payment_method_id: str

class UpdatePaymentMethodRequest(BaseModel):
    payment_method_id: str
    new_payment_method_id: str

class DeleteCustomerRequest(BaseModel):
    customer_id: str

class BillingPortalRequest(BaseModel):
    user_id: str
    return_url: str

class WebhookEvent(BaseModel):
    id: str
    object: str
    type: str
    data: dict

@router.post("/create-checkout-session")
async def create_checkout_session(request: CheckoutSessionRequest, http_request: Request):
    """
    Create a Stripe checkout session for premium subscription
    """
    try:
        # Get user_id and email from request body
        user_id = request.user_id
        customer_email = request.customer_email
        
        if not user_id:
            raise HTTPException(status_code=400, detail="User ID is required")

        # Prefer email from Bearer token claims; fall back to request body if unavailable
        auth_header = http_request.headers.get("authorization") or http_request.headers.get("Authorization")
        token = None
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()

        derived_email = None
        payload = None
        if token:
            try:
                payload = jwt.decode(token, options={"verify_signature": False, "verify_aud": False})
                derived_email = (
                    payload.get("email")
                    or payload.get("email_address")
                    or payload.get("user_email")
                )
            except Exception:
                derived_email = None



        # If JWT didn't contain email, try fetching from Clerk using user id in token
        if not derived_email and payload:
            
            clerk_secret = os.environ.get("CLERK_SECRET_KEY")
            if user_id and clerk_secret:
                try:
                    resp = requests.get(
                        f"{CLERK_API_BASE}/users/{user_id}",
                        headers={
                            "Authorization": f"Bearer {clerk_secret}",
                            "Content-Type": "application/json",
                        },
                        timeout=8,
                    )
                    if resp.status_code < 400:
                        u = resp.json()

                        # Print all metadata
                        print("\n=== Metadata ===")
                        print(f"Public Metadata: {u.get('public_metadata', {})}")
                        print(f"Private Metadata: {u.get('private_metadata', {})}")
                        
                        # Prefer primary email address if available
                        primary_id = (u.get("primary_email_address_id") or "").strip()
                        emails = u.get("email_addresses") or []
                        email_map = {e.get("id"): e.get("email_address") for e in emails if e}
                        derived_email = email_map.get(primary_id)
                        if not derived_email and emails:
                            # fallback to the first email
                            derived_email = emails[0].get("email_address")
                except Exception:
                    pass

        effective_email = derived_email or request.customer_email

        result = stripe_manager.create_premium_checkout_session(
            customer_email=effective_email,
            user_id = request.user_id,
            success_url=request.success_url,
            cancel_url=request.cancel_url
        )
        
        if result["success"]:

            return {
                "success": True,
                "checkout_url": result["checkout_url"],
                "session_id": result["session_id"]
            }
        else:
            raise HTTPException(status_code=400, detail=result["error"])
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/subscription-status")
async def get_subscription_status(request: SubscriptionStatusRequest):
    """
    Get subscription status for a customer
    """
    try:
        result = stripe_manager.get_subscription_status(request.customer_email)
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/cancel-subscription")
async def cancel_subscription(request: CancelSubscriptionRequest):
    """
    Cancel subscription for a customer
    """
    try:
        result = stripe_manager.cancel_subscription(request.customer_email)
        
        if result["success"]:
            return result
        else:
            raise HTTPException(status_code=400, detail=result["error"])
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/next-payment-due")
async def get_next_payment_due(request: NextPaymentRequest):
    """
    Get the next payment due date for a customer's subscription
    """
    try:
        result = stripe_manager.get_next_payment_due(request.customer_email)
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def health_check():
    """Health check endpoint to verify Stripe integration is working"""
    return {"status": "healthy", "stripe_key_configured": bool(os.getenv("STRIPE_SECRET"))}

@router.get("/payment-methods/{user_id}")
async def get_payment_methods(user_id: str):
    """
    Get payment methods for the specified user
    Returns:
        {
            "success": bool,
            "has_payment_method": bool,
            "cards": List[dict] | None,
            "error": str | None
        }
    """
    print(f"\n=== Fetching payment methods for user: {user_id} ===")
    
    if not user_id:
        return {
            "success": False,
            "has_payment_method": False,
            "error": "User ID is required"
        }
    
    try:
        # Get payment methods from Stripe
        result = stripe_manager.get_customer_payment_methods(user_id)
        
        if not result.get("success"):
            error_msg = result.get("error", "Failed to fetch payment methods")
            print(f"Error from Stripe manager: {error_msg}")
            return {
                "success": False,
                "has_payment_method": False,
                "error": error_msg
            }
            
        # Return the formatted response
        return {
            "success": True,
            "has_payment_method": bool(result.get("cards")),
            "cards": result.get("cards", []),
            "error": None
        }
        
    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "has_payment_method": False,
            "error": error_msg
        }

@router.delete("/delete-customer/{user_id}")
async def delete_customer(user_id: str):
    """
    Delete a customer from Stripe and update Clerk metadata
    
    Args:
        user_id: The Clerk user ID from the URL path
        
    Returns:
        {
            "success": bool,
            "message": str,
            "error": Optional[str]
        }
    """
    try:
        # Use the stripe_manager to delete the customer
        result = stripe_manager.delete_customer(user_id)
        
        if not result.get('success'):
            return {
                "success": False,
                "message": "Failed to delete customer",
                "error": result.get('error', 'Unknown error')
            }
        
        # Prepare update data
        update_url = f"{API_BASE_URL}/update-user"
        update_data = {
            "user_id": user_id,
            "plan": "Free",
            "stripe_customer_id": "",
            "subscription_status": "canceled"
        }
        
        # Use aiohttp for async HTTP request with timeout
        import asyncio
        from aiohttp import ClientSession, ClientTimeout
        
        timeout = ClientTimeout(total=5)  # 5 seconds timeout
        async with ClientSession(timeout=timeout) as session:
            try:
                async with session.put(
                    update_url,
                    json=update_data,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    if response.status != 200:
                        # Log the error but don't fail the entire operation
                        error_text = await response.text()
                        print(f"Warning: Failed to update user: {error_text}")
                        
                        return {
                            "success": False,
                            "message": "Customer deleted but failed to update user data",
                            "error": f"Update error: {error_text}"
                        }
            except Exception as update_error:
                # Log the error but don't fail the entire operation
                print(f"Warning: Error updating user: {str(update_error)}")
                return {
                    "success": False,
                    "message": "Customer deleted but encountered an error updating user data",
                    "error": str(update_error)
                }
        
        return {
            "success": True,
            "message": "Customer deleted successfully"
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": "Failed to process customer deletion",
            "error": str(e)
        }

@router.delete("/unsubscribe-customer/{user_id}")
async def cancel_subscription(user_id: str):
    """
    Cancel a customer's subscription in Stripe and update Clerk metadata
    
    Args:
        user_id: The Clerk user ID from the URL path
        
    Returns:
        {
            "success": bool,
            "message": str,
            "error": Optional[str]
        }
    """
    try:
        # Get the customer's email from Clerk
        clerk_secret = os.getenv("CLERK_SECRET_KEY")
        headers = {
            "Authorization": f"Bearer {clerk_secret}",
            "Content-Type": "application/json",
        }
        
        # Get user data from Clerk
        user_url = f"{CLERK_API_BASE}/users/{user_id}"
        user_resp = requests.get(user_url, headers=headers)
        user_resp.raise_for_status()
        user_data = user_resp.json()
        
        email = user_data.get('email_addresses', [{}])[0].get('email_address')
        if not email:
            return {
                "success": False,
                "message": "Could not find user's email address"
            }
        
        # Cancel the subscription
        result = stripe_manager.cancel_subscription(email)
        
        if not result.get('success'):
            return {
                "success": False,
                "message": result.get('error', 'Failed to cancel subscription')
            }
        
        # Update Clerk metadata to reflect the cancellation
        update_data = {
            "private_metadata": {
                **user_data.get("private_metadata", {}),
                "subscription_status": "canceled",
                "plan": "Starter"
            }
        }
        
        update_resp = requests.patch(user_url, headers=headers, json=update_data)
        update_resp.raise_for_status()
        
        return {
            "success": True,
            "message": "Subscription canceled successfully"
        }
        
    except requests.exceptions.RequestException as e:
        error_detail = str(e)
        if hasattr(e, 'response') and e.response is not None:
            error_detail = e.response.text
        return {
            "success": False,
            "message": "Failed to update user data",
            "error": error_detail
        }
    except Exception as e:
        return {
            "success": False,
            "message": "Failed to process subscription cancellation",
            "error": str(e)
        }

@router.post("/create-billing-portal-session")
async def create_billing_portal_session(request: BillingPortalRequest):
    """
    Create a Stripe Billing Portal session for the customer to manage payment methods
    
    Args:
        user_id: The Clerk user ID
        return_url: URL to return to after the portal session ends
        
    Returns:
        {
            "success": bool,
            "url": str,  # URL to redirect to the billing portal
            "error": Optional[str]
        }
    """
    try:
        # Get the customer ID from Clerk metadata
        metadata = stripe_manager._get_clerk_metadata(request.user_id)
        customer_id = metadata.get('stripe_customer_id')
        
        if not customer_id:
            return {
                "success": False,
                "error": "No Stripe customer found for this user"
            }
            
        # Create a billing portal session
        result = stripe_manager.create_billing_portal_session(
            customer_id=customer_id,
            return_url=request.return_url
        )
        
        if not result.get('success'):
            return {
                "success": False,
                "error": result.get('error', 'Failed to create billing portal session')
            }
            
        return {
            "success": True,
            "url": result['url']
        }
        
    except Exception as e:
        print(f"Error creating billing portal session: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }


@router.post("/webhook")
async def stripe_webhook(event: WebhookEvent):
    """
    Handle Stripe webhooks to update Stripe customer ID and plan in Clerk
    """
    print("\n" + "="*50)
    print("🔄 WEBHOOK RECEIVED")
    print(f"🔔 Event type: {event.type}")

    try:
        # Handle checkout.session.completed events
        if event.type == "checkout.session.completed":
            obj = event.data.get("object", {})
            customer_id = obj.get("customer")
            metadata = obj.get("metadata", {})
            user_id = metadata.get("user_id")

            if not user_id:
                print("❌ No user_id found in metadata")
                raise HTTPException(
                    status_code=400,
                    detail="No user_id in metadata"
                )

            print(f"\n🔍 Extracted data:")
            print(f"- Customer ID: {customer_id}")
            print(f"- User ID: {user_id}")

            try:
                # Import inside the function to avoid circular imports
                from app.main import update_user, UpdateUserRequest
                
                # Call the update_user function (don't await it)
                result = update_user(
                    UpdateUserRequest(
                        user_id=user_id,
                        plan="Starter",
                        stripe_customer_id=customer_id,
                        subscription_status="active"
                    )
                )
                
                # Convert result to dict if it's not already
                if hasattr(result, 'dict'):
                    result = result.dict()
                elif not isinstance(result, dict):
                    result = {"result": str(result)}
                    
                print("✅ Successfully updated user in Clerk:", result)
                return JSONResponse(status_code=200, content={"status": "success"})
                
            except Exception as update_error:
                print(f"❌ Error updating user in Clerk: {str(update_error)}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to update user in Clerk: {str(update_error)}"
                )
        
        # Handle subscription cancellation completed (end of billing period)
        elif event.type == "customer.subscription.deleted":
            try:
                # Debug: Print the raw event structure
                print("\n🔍 Raw event structure:", type(event))
                print("🔍 Event dict:", event.dict() if hasattr(event, 'dict') else "No dict method")
                print("🔍 Event data type:", type(event.data) if hasattr(event, 'data') else "No data attribute")
                
                # Try to get subscription data
                subscription = None
                if hasattr(event, 'data') and hasattr(event.data, 'object'):
                    subscription = event.data.object
                    print("✅ Got subscription from event.data.object")
                elif hasattr(event, 'data') and isinstance(event.data, dict) and 'object' in event.data:
                    subscription = event.data['object']
                    print("✅ Got subscription from event.data['object']")
                elif isinstance(event, dict) and 'data' in event and 'object' in event['data']:
                    subscription = event['data']['object']
                    print("✅ Got subscription from event['data']['object']")
                
                if subscription is None:
                    print("❌ Could not find subscription data in event")
                    return JSONResponse(
                        status_code=400,
                        content={"status": "error", "message": "Could not find subscription data in event"}
                    )
                
                print("🔍 Subscription type:", type(subscription))
                print("🔍 Subscription dict:", subscription.dict() if hasattr(subscription, 'dict') else "No dict method")
                
                # Safely get customer_id
                customer_id = None
                if hasattr(subscription, 'customer'):
                    customer_id = subscription.customer
                    print("✅ Got customer_id from subscription.customer")
                elif isinstance(subscription, dict) and 'customer' in subscription:
                    customer_id = subscription['customer']
                    print("✅ Got customer_id from subscription['customer']")
                
                if not customer_id:
                    print("❌ No customer ID found in subscription")
                    return JSONResponse(
                        status_code=400,
                        content={"status": "error", "message": "No customer ID in subscription"}
                    )
                
                print(f"🔍 Found customer_id: {customer_id}")
                
                # Get the user data first to check current subscription status
                users_url = f"{CLERK_API_BASE}/users"
                response = requests.get(users_url, headers={
                    "Authorization": f"Bearer {os.getenv('CLERK_SECRET_KEY')}",
                    "Content-Type": "application/json",
                })
                response.raise_for_status()
                
                user = None
                for u in response.json():
                    if u.get('private_metadata', {}).get('stripe_customer_id') == customer_id:
                        user = u
                        break
                
                if not user:
                    print(f"❌ No user found with customer ID: {customer_id}")
                    return JSONResponse(
                        status_code=200,
                        content={"status": "user_not_found"}
                    )

                user_id = user.get('id')
                if not user_id:
                    print("❌ No user ID found in user object")
                    return JSONResponse(
                        status_code=400,
                        content={"status": "error", "message": "No user ID in user object"}
                    )
                
                # Get current private metadata
                private_metadata = user.get('private_metadata', {})
                current_status = private_metadata.get('subscription_status')
                
                # Get subscription end date (current_period_end)
                current_period_end = None
                if hasattr(subscription, 'current_period_end'):
                    current_period_end = subscription.current_period_end
                elif isinstance(subscription, dict) and 'current_period_end' in subscription:
                    current_period_end = subscription['current_period_end']
                
                # Check if subscription has ended
                from datetime import datetime
                has_ended = current_period_end and datetime.now().timestamp() > current_period_end
                
                # For deleted subscriptions or ended subscriptions, update to Free
                if event.type == "customer.subscription.deleted" or has_ended:
                    print(f"🔔 Processing {'deleted' if event.type == 'customer.subscription.deleted' else 'ended'} subscription")
                    print(f"🔍 Current status: {current_status}, Period end: {current_period_end}")
                else:
                    # For updated subscriptions, check if it's a cancellation
                    cancel_at_period_end = False
                    if hasattr(subscription, 'cancel_at_period_end'):
                        cancel_at_period_end = subscription.cancel_at_period_end
                    elif isinstance(subscription, dict) and 'cancel_at_period_end' in subscription:
                        cancel_at_period_end = subscription['cancel_at_period_end']
                    
                    subscription_status = None
                    if hasattr(subscription, 'status'):
                        subscription_status = subscription.status
                    elif isinstance(subscription, dict) and 'status' in subscription:
                        subscription_status = subscription['status']
                    
                    print(f"🔍 Subscription status: {subscription_status}, "
                          f"Cancel at period end: {cancel_at_period_end}, "
                          f"Current status in metadata: {current_status}")
                    
                    # Only update if this is a cancellation at period end
                    if not (cancel_at_period_end and subscription_status == 'canceled'):
                        print("ℹ️ Subscription updated but not at end of period, ignoring")
                        return JSONResponse(
                            status_code=200,
                            content={"status": "ignored", "reason": "Subscription not at end of period"}
                        )
                
                # Update both public and private metadata
                update_data = {
                    "public_metadata": {
                        **user.get('public_metadata', {}),
                        "plan": "Free"
                    },
                    "private_metadata": {
                        **private_metadata,
                        "plan": "Free",
                        "subscription_status": "canceled",
                        "subscription_ended_at": datetime.now().isoformat()
                    }
                }

                
                update_url = f"{CLERK_API_BASE}/users/{user_id}"
                update_response = requests.patch(update_url, headers={
                    "Authorization": f"Bearer {os.getenv('CLERK_SECRET_KEY')}",
                    "Content-Type": "application/json",
                }, json=update_data)
                update_response.raise_for_status()
                
                print(f"✅ Updated user {user['id']} to Free plan after subscription ended")
                return JSONResponse(
                    status_code=200,
                    content={"status": "success", "user_id": user['id']}
                )
                
            except Exception as e:
                print(f"❌ Error processing subscription update: {str(e)}")
                import traceback
                traceback.print_exc()
                raise HTTPException(
                    status_code=400,
                    detail=f"Error processing subscription update: {str(e)}"
                )
        elif event.type == 'setup_intent.succeeded':
            setup_intent = event['data']['object']
            # Update the subscription with the payment method
            subscription = stripe.Subscription.modify(
                setup_intent.metadata.get('subscription_id'),
                default_payment_method=setup_intent.payment_method
            )        
        else:
            print(f"ℹ️ No action taken for event type: {event.type}")
            return JSONResponse(
                status_code=200,
                content={"status": "success", "message": f"No action for {event.type}"}
            )
            
    except Exception as e:
        print(f"❌ Webhook error: {str(e)}")
        raise HTTPException(
            status_code=400,
            detail=f"Webhook error: {str(e)}"
        )