import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReportAnalysis } from "./ReportAnalysis";
import { AnalysisResults } from "./AnalysisResults";
import { FileSearch, BarChart3, Loader2, Lock } from "lucide-react";
import { useState, useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { premiumService } from "@/services/premiumService";

export function MainTabs() {
  const [insights, setInsights] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("analysis");
  const { user } = useUser();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // Get user's plan from Clerk metadata, default to 'Free'
  const userPlan = (user?.publicMetadata?.plan as string) || 'Free';
  const isFreePlan = userPlan === 'Free';

  // Effect to handle plan changes and redirect if needed
  useEffect(() => {
    // If user is on a premium tab but doesn't have access, redirect to upgrade
    if (isFreePlan && activeTab !== 'upgrade') {
      setActiveTab('upgrade');
    }
  }, [isFreePlan, activeTab]);

  const handleTabChange = (value: string) => {
    if (isFreePlan && value !== 'upgrade') {
      toast({
        title: "Premium Feature",
        description: "Please upgrade to access this feature",
        variant: "default",
      });
      return;
    }
    setActiveTab(value);
  };

  const handleAnalysisComplete = (data: any) => {
    setInsights(data);
    setIsAnalyzing(false);
    if (!isFreePlan) {
      setActiveTab('results');
    }
  };

  const handleAnalyzeStart = () => {
    setIsAnalyzing(true);
  };

  const handleGetPremium = async () => {
    try {
      const user_id = user?.id;
      const clerkEmail = user?.primaryEmailAddress?.emailAddress || "";
      const email = clerkEmail || (await premiumService.getUserEmail());
      if (!email) throw new Error("Could not determine user email");
      const response = await premiumService.createCheckoutSession(email, user_id);
      if (response.success && response.checkout_url) {
        window.location.href = response.checkout_url;
      } else {
        toast({
          title: "Error",
          description: response.error || "Failed to create checkout session",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to initiate premium checkout",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      <Tabs 
        value={activeTab} 
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 mb-8 bg-muted h-12">
          <TabsTrigger 
            value="analysis" 
            disabled={isFreePlan}
            className={`flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-smooth ${
              isFreePlan ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isFreePlan ? (
              <Lock className="w-4 h-4" />
            ) : (
              <FileSearch className="w-4 h-4" />
            )}
            {isFreePlan ? 'Upgrade Required' : 'Repository Analysis'}
          </TabsTrigger>
          <TabsTrigger 
            value="results" 
            disabled={!insights || isAnalyzing || isFreePlan}
            className={`flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-smooth ${
              (!insights || isAnalyzing || isFreePlan) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isAnalyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <BarChart3 className="w-4 h-4" />
            )}
            Analysis Results
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="mt-0">
          <ReportAnalysis 
            onAnalysisComplete={handleAnalysisComplete}
            onAnalyzeStart={handleAnalyzeStart}
          />
        </TabsContent>

        <TabsContent value="results" className="mt-0">
          <AnalysisResults insights={insights} />
        </TabsContent>

        {isFreePlan && (
          <TabsContent value="upgrade" className="mt-8 text-center">
            <div className="bg-muted/50 rounded-lg p-8 max-w-2xl mx-auto">
              <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Upgrade to Premium</h3>
              <p className="text-muted-foreground mb-6">
                Repository analysis is a premium feature. Upgrade your plan to unlock full access to all features.
              </p>
              <button
                onClick={handleGetPremium}
                className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-6 py-2 rounded-md hover:from-purple-600 hover:to-indigo-700 transition-colors"
              >
                Upgrade Now
              </button>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}