import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import React, { useState, useEffect } from "react";
import { premiumService, PaymentMethodCard } from "@/services/premiumService";
import { useUser } from "@clerk/clerk-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  User,
  Bell,
  Shield, 
  CreditCard, 
  Lock, 
  Loader2,
  XCircle,
  Pencil,
} from "lucide-react";

export default function SettingsPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodCard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showUnsubscribeModal, setShowUnsubscribeModal] = useState<boolean>(false);
  const [isUnsubscribing, setIsUnsubscribing] = useState<boolean>(false);
  const { toast } = useToast();
  const {user} = useUser();
  const user_id = user?.id;
  const userPlan = user?.publicMetadata?.plan 
    ? String(user.publicMetadata.plan) 
    : "Free";
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPaymentMethods = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const result = await premiumService.getPaymentMethods(user_id);
        
        if (result.success && result.cards) {
          setPaymentMethods(result.cards);
          
          // If user has payment methods, they're likely on a paid plan
          // if (result.cards.length > 0) {
          //   setUserPlan("Starter");
          // }
        } else {
          setError(result.error || "Failed to load payment methods");
        }
      } catch (err) {
        console.error("Error fetching payment methods:", err);
        setError("An error occurred while fetching payment methods");
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentMethods();
  }, []);

  const handleManageBilling = async () => {
    try {
      if (userPlan === "Free") {
        // Redirect to billing page if upgrading
        window.location.href = "/";
        return;
      }
      
      // Show the unsubscribe confirmation modal
      setShowUnsubscribeModal(true);
      
    } catch (error) {
      console.error("Error managing subscription:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process your request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleConfirmUnsubscribe = async () => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "User not authenticated",
        variant: "destructive",
      });
      return;
    }

    setIsUnsubscribing(true);
    setError("");
    
    try {
      const response = await premiumService.cancelSubscription(user.id);
      
      if (response.success) {
        toast({
          title: "Success",
          description: response.message || "Your subscription has been canceled. You will retain access until the end of your billing period.",
        });
        
        // Refresh user data to reflect the cancellation
        await user?.reload();
        
        // Close the confirmation dialog
        setShowUnsubscribeModal(false);
        
        // Redirect to billing page
        navigate("/");
      } else {
        throw new Error(response.error || "Failed to cancel subscription");
      }
    } catch (err) {
      const error = err as Error;
      console.error("Error canceling subscription:", error);
      setError(error.message || "An error occurred while canceling your subscription");
      
      toast({
        title: "Error",
        description: error.message || "Failed to cancel subscription",
        variant: "destructive",
      });
    } finally {
      setIsUnsubscribing(false);
    }
  };

  const handleDeletePaymentMethod = async (paymentMethodId: string) => {
    if (!window.confirm('Are you sure you want to delete this payment method?')) {
      return;
    }
    
    try {
      setLoading(true);
      // TODO: Implement delete payment method API call
      // const result = await premiumService.deletePaymentMethod(paymentMethodId);
      // if (result.success) {
      //   setPaymentMethods(paymentMethods.filter(method => method.id !== paymentMethodId));
      //   toast({
      //     title: "Success",
      //     description: "Payment method deleted successfully",
      //   });
      // }
      toast({
        title: "Success",
        description: "Payment method deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting payment method:", error);
      toast({
        title: "Error",
        description: "Failed to delete payment method. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditPaymentMethod = async (paymentMethod: PaymentMethodCard) => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "User not authenticated",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const result = await premiumService.createBillingPortalSession(user.id);
      
      if (result.success && result.url) {
        // Redirect to the Stripe Billing Portal
        window.location.href = result.url;
      } else {
        throw new Error(result.error || 'Failed to open billing portal');
      }
    } catch (error) {
      console.error("Error opening billing portal:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to open billing portal",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getCardIcon = (brand: string) => {
    const brandLower = brand.toLowerCase();
    switch (brandLower) {
      case 'visa':
        return 'VISA';
      case 'mastercard':
        return 'MC';
      case 'amex':
        return 'AMEX';
      case 'discover':
        return 'DISC';
      default:
        return brand.toUpperCase();
    }
  };

  const handleToggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  const settings = [
    {
      title: "Account",
      description: "Update your account information",
      icon: <User className="w-5 h-5" />,
      onClick: () => navigate("/account"),
    },
    {
      title: "Billing",
      description: "Manage your subscription and payment methods",
      icon: <CreditCard className="w-5 h-5" />,
      onClick: () => navigate("/"),
    },
    {
      title: "Notifications",
      description: "Configure your notification preferences",
      icon: <Bell className="w-5 h-5" />,
      onClick: () => {},
    },
    {
      title: "Security",
      description: "Manage your password and security settings",
      icon: <Lock className="w-5 h-5" />,
      onClick: () => {},
    },
    {
      title: "Privacy",
      description: "Control your privacy settings",
      icon: <Shield className="w-5 h-5" />,
      onClick: () => {},
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar isDarkMode={isDarkMode} onToggleTheme={handleToggleTheme} />
      <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-6 mb-2">
          <Button 
            variant="outline" 
            size="icon" 
            className="h-8 w-8" 
            onClick={() => navigate('/')}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="m12 19-7-7 7-7"/>
              <path d="M19 12H5"/>
            </svg>
          </Button>
          <h1 className="text-3xl font-bold">Settings</h1>
        </div>
        <p className="text-muted-foreground ml-12">Manage your account settings and preferences</p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Subscription Plan
          </CardTitle>
          <CardDescription>Manage your subscription plan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold">{userPlan} Plan</h3>
              <p className="text-muted-foreground">
                {userPlan === "Free" 
                  ? "Upgrade to access premium features" 
                  : "You have access to all premium features"}
              </p>
            </div>
            
            <Button 
              onClick={() => {
                if (userPlan === "Free") {
                  // Redirect to billing page if upgrading
                  window.location.href = "/";
                } else {
                  handleManageBilling();
                }
              }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                userPlan === "Free" ? "Upgrade Plan" : "Unsubscribe"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Payment Methods */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Methods
          </CardTitle>
          <CardDescription>Your saved payment methods</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              <XCircle className="h-8 w-8 mx-auto mb-2" />
              <p>{error}</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </div>
          ) : paymentMethods.length > 0 ? (
            <div className="space-y-4">
              {paymentMethods.map((method) => (
                <div 
                  key={method.id} 
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-muted rounded-md">
                      <span className="font-mono text-sm font-medium">
                        {getCardIcon(method.brand)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">
                        •••• •••• •••• {method.last4}
                        {method.is_default && (
                          <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            Default
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Expires {method.exp_month.toString().padStart(2, '0')}/{method.exp_year.toString().slice(-2)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleEditPaymentMethod(method)}
                      disabled={loading}
                      className="hover:bg-blue-600"
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                    </Button>
                    {/* <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleDeletePaymentMethod(method.id)}
                      disabled={loading}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                    </Button> */}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h4 className="text-lg font-medium mb-2">No payment methods</h4>
              <p className="text-muted-foreground mb-4">
                Add a payment method to upgrade your plan
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Unsubscribe Confirmation Modal */}
      <Dialog open={showUnsubscribeModal} onOpenChange={setShowUnsubscribeModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Unsubscribe</DialogTitle>
            <DialogDescription>
              Are you sure you want to unsubscribe? This will cancel your subscription and you will lose access to premium features at the end of your billing period.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowUnsubscribeModal(false)}
              disabled={isUnsubscribing}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmUnsubscribe}
              disabled={isUnsubscribing}
            >
              {isUnsubscribing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : 'Unsubscribe'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
