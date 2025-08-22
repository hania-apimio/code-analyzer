import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReportAnalysis } from "./ReportAnalysis";
import { AnalysisResults } from "./AnalysisResults";
import { FileSearch, BarChart3 } from "lucide-react";
import { useState } from "react";

export function MainTabs() {
  const [insights, setInsights] = useState(null);

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      <Tabs defaultValue="analysis" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-8 bg-muted h-12">
          <TabsTrigger 
            value="analysis" 
            className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-smooth"
          >
            <FileSearch className="w-4 h-4" />
            Repository Analysis
          </TabsTrigger>
          <TabsTrigger 
            value="results" 
            className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-smooth"
          >
            <BarChart3 className="w-4 h-4" />
            Analysis Results
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="mt-0">
          <ReportAnalysis onAnalysisComplete={setInsights} />
        </TabsContent>

        <TabsContent value="results" className="mt-0">
          <AnalysisResults insights={insights} />
        </TabsContent>
      </Tabs>
    </div>
  );
}