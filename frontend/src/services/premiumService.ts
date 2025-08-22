const API_URL = import.meta.env.VITE_API_URL;
import { useUser, useClerk } from "@clerk/clerk-react";

export interface CheckoutSessionResponse {
  success: boolean;
  checkout_url?: string;
  session_id?: string;
  error?: string;
}

export interface SubscriptionStatus {
  has_subscription: boolean;
  status?: string;
  subscription_id?: string;
  current_period_end?: number;
  error?: string;
}

export interface CancelSubscriptionResponse {
  success: boolean;
  message?: string;
  cancel_at?: number;
  error?: string;
    current_period_end?: string | number;
}

export interface CardDetails {
  card_number: string;
  expiry_month: number;
  expiry_year: number;
  cardholder_name: string;
}

export interface StoredCardDetails {
  username: string;
  card_number_last4: string;
  expiry_month: number;
  expiry_year: number;
  cardholder_name: string;
  created_at: string;
  updated_at: string;
}

export interface NextPaymentResponse {
  success: boolean;
  next_payment_due?: string;
  current_period_end?: number;
  error?: string;
}

export interface PaymentMethodDetails {
  id: string;
  card: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
  billing_details: {
    name: string;
    email: string;
  };
}

export interface PaymentMethodCard {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
}

export interface PaymentMethodsResponse {
  success: boolean;
  has_payment_method: boolean;
  cards?: PaymentMethodCard[];
  customer_id?: string;
  error?: string;
  message?: string;
}

export interface BillingPortalResponse {
  success: boolean;
  url?: string;
  error?: string;
}

class PremiumService {
  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    
    const response = await fetch(`${API_URL}/api${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async createCheckoutSession(customerEmail: string, user_id: string): Promise<CheckoutSessionResponse> {
    const successUrl = `${window.location.origin}/?premium=success`;
    const cancelUrl = `${window.location.origin}/?premium=canceled`;

    try {
      const response = await this.makeRequest("/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({
          customer_email: customerEmail,
          user_id: user_id,
          success_url: successUrl,
          cancel_url: cancelUrl,
        }),
      });

      return response;
    } catch (error) {
      console.error("Error creating checkout session:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  async getUserEmail(): Promise<string> {
    const { user } = useUser();
    const email = user?.primaryEmailAddress?.emailAddress || "";
    return email
  }

  async getSubscriptionStatus(customerEmail: string): Promise<SubscriptionStatus> {
    try {
      const response = await this.makeRequest("/subscription-status", {
        method: "POST",
        body: JSON.stringify({
          customer_email: customerEmail,
        }),
      });

      return response;
    } catch (error) {
      console.error("Error getting subscription status:", error);
      return {
        has_subscription: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  async cancelSubscription(userId: string): Promise<CancelSubscriptionResponse> {
    try {
      if (!userId) {
        throw new Error("User ID is required");
      }

      const response = await this.makeRequest(`/unsubscribe-customer/${userId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})  // Empty object as required by the backend
      });

      if (response.success) {
        return {
          success: true,
          message: response.message || 'Subscription cancellation successful',
          current_period_end: response.current_period_end
        };
      } else {
        throw new Error(response.error || 'Failed to cancel subscription');
      }
    } catch (error) {
      console.error("Error canceling subscription:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "An unknown error occurred while canceling subscription"
      };
    }
  }

  async checkHealth(): Promise<{ status: string; stripe_key_configured: boolean }> {
    try {
      const response = await this.makeRequest("/health", {
        method: "GET",
      });

      return response;
    } catch (error) {
      console.error("Error checking health:", error);
      return {
        status: "unhealthy",
        stripe_key_configured: false,
      };
    }
  }

  async getPaymentMethod(): Promise<PaymentMethodDetails | null> {
    try {
      const response = await this.makeRequest('/get-payment-method', { method: 'GET' });
      return response.payment_method || null;
    } catch (error) {
      console.error('Error fetching payment method:', error);
      return null;
    }
  }

  async getPaymentMethods(user_id:string): Promise<PaymentMethodsResponse> {
    try {
      return await this.makeRequest(`/payment-methods/${user_id}`, { method: 'GET' });
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      return { 
        success: false, 
        has_payment_method: false, 
        error: 'Failed to fetch payment methods' 
      };
    }
  }

  async deleteCustomer(userId: string): Promise<{success: boolean; message?: string; error?: string}> {
    try {
      const response = await this.makeRequest(`/delete-customer/${userId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });
      return response;
    } catch (error) {
      console.error('Error deleting customer:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete customer',
      };
    }
  }

  async createBillingPortalSession(userId: string): Promise<{success: boolean; url?: string; error?: string}> {
    try {
      const response = await fetch(`${API_URL}/api/create-billing-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          return_url: `${window.location.origin}/settings`  // Return to settings after managing billing
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create billing portal session');
      }

      return data;
    } catch (error) {
      console.error('Error creating billing portal session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create billing portal session'
      };
    }
  }
}

export const premiumService = new PremiumService();