import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, CalendarIcon, GitBranch, Shield, RefreshCw, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/use-toast";

const API_URL = import.meta.env.VITE_API_URL;

interface Branch {
  name: string;
  protected: boolean;
  commit: {
    sha: string;
    url: string;
  };
}

interface CodeQualityMetrics {
  total_loc: { value: number; assessment: string };
  avg_commit_size: { value: number; assessment: string };
  code_churn_rate: { value: number; assessment: string };
  commit_message_quality: { value: number; assessment: string };
  comment_density: { value: number; assessment: string };
  technical_debt_score: { value: number; assessment: string };
  code_smells: { value: number; assessment: string };
  test_coverage: { value: number; assessment: string };
  security_warnings: { value: number; assessment: string };
}


interface CommitFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
}

interface Commit {
  sha: string;
  date: string;
  author_name: string;
  author_email: string;
  committer_name: string;
  committer_email: string;
  author_login: string;
  committer_login: string;
  message: string;
  additions: number;
  deletions: number;
  changes: number;
  files: CommitFile[];
  branches: string[];
}

interface RepoInsights {
  token: string;
  owner: string;
  repo: string;
  total_unique_commits: number;
  total_branches: number;
  total_developers: number;
  latest_activity_date: string;
  per_branch: Record<string, number>;
  by_developer: Array<{
    username: string;
    commits: number;
  }>;
  author_metrics: Record<string, {
    total_commits: number;
    lines_added: number;
    lines_removed: number;
    files_changed: number;
    quality_metrics: {
      quality_score: number;
      low_risk_score: number;
      simple_commits: number;
    };
    commits: Commit[];
    branches: string[];
  }>;
  code_quality_metrics: CodeQualityMetrics;
}

interface ReportAnalysisProps {
  onAnalysisComplete: (insights: RepoInsights) => void;
}

export function ReportAnalysis({ onAnalysisComplete }: ReportAnalysisProps) {
  const [platform, setPlatform] = useState<string>("");
  const [repositoryOwner, setRepositoryOwner] = useState("");
  const [repositoryName, setRepositoryName] = useState("");
  const [personalToken, setPersonalToken] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [commitHash, setCommitHash] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleFetchBranches = async () => {
    if (!repositoryOwner.trim() || !repositoryName.trim() || !personalToken.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all required fields (Repository Owner, Repository Name, and Personal Access Token)",
      });
      return;
    }

    setIsLoadingBranches(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/repos/${repositoryOwner}/${repositoryName}/branches`, {
        headers: {
          'X-GitHub-Token': personalToken,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to fetch branches');
      }

      const data = await response.json();
      setBranches(data.branches || []);
      
      // Clear any previously selected branches
      setSelectedBranches([]);

    } catch (err) {
      const errorMessage =  'Failed to fetch branches';
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
      setBranches([]);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const handleBranchToggle = (branchName: string) => {
    setSelectedBranches(prev => 
      prev.includes(branchName)
        ? prev.filter(name => name !== branchName)
        : [...prev, branchName]
    );
  };

  const handleSelectAll = () => {
    setSelectedBranches(branches.map(branch => branch.name));
  };

  const handleClearAll = () => {
    setSelectedBranches([]);
  };

  const handleAnalyze = async () => {
    if (!repositoryOwner.trim() || !repositoryName.trim() || !personalToken.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all required fields (Repository Owner, Repository Name, and Personal Access Token)",
      });
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/repos/${repositoryOwner}/${repositoryName}/insights`, {
        headers: {
          'X-GitHub-Token': personalToken,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to analyze repository');
      }

      const data = await response.json();
      // Include the token in the response data
      const insightsWithToken = {
        ...data,
        token: personalToken
      };
      onAnalysisComplete(insightsWithToken);
      
      toast({
        title: "Analysis Complete",
        description: "Repository analysis was successful",
      });
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze repository';
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeButtonText = `Analyze Github Repository${selectedBranches.length > 0 ? ` (${selectedBranches.length} branch${selectedBranches.length === 1 ? '' : 'es'})` : ''}`;

  return (
    <div className="space-y-6">
      {/* Repository Configuration */}
      <Card className="shadow-card bg-gradient-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-black dark:text-black">
            <GitBranch className="w-5 h-5 text-primary" />
            Repository Configuration
          </CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-600">
            Enter your GitHub repository details to analyze commits
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Platform */}
            <div className="space-y-2">
              <Label htmlFor="platform" className="text-sm font-medium text-black dark:text-black">
                Platform
              </Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="bg-background border-border hover:border-primary transition-smooth">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent className="bg-background border-border">
                  <SelectItem value="github">GitHub</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Repository Owner */}
            <div className="space-y-2">
              <Label htmlFor="owner" className="text-sm font-medium text-black dark:text-black">
                Repository Owner
              </Label>
              <Input
                id="owner"
                placeholder="owner-123"
                value={repositoryOwner}
                onChange={(e) => setRepositoryOwner(e.target.value)}
                className="bg-background border-border hover:border-primary focus:border-primary transition-smooth"
              />
            </div>

            {/* Repository Name */}
            <div className="space-y-2">
              <Label htmlFor="repo" className="text-sm font-medium text-black dark:text-black">
                Repository Name
              </Label>
              <Input
                id="repo"
                placeholder="code-analyzer"
                value={repositoryName}
                onChange={(e) => setRepositoryName(e.target.value)}
                className="bg-background border-border hover:border-primary focus:border-primary transition-smooth"
              />
            </div>

            {/* Personal Token */}
            <div className="space-y-2">
              <Label htmlFor="token" className="text-sm font-medium text-black dark:text-black">
                GitHub Personal Access Token
              </Label>
              <Input
                id="token"
                type="password"
                placeholder="••••••••••••••••••••••••••••••••••••••••"
                value={personalToken}
                onChange={(e) => setPersonalToken(e.target.value)}
                className="bg-background border-border hover:border-primary focus:border-primary transition-smooth"
              />
              <p className="text-xs text-gray-600 dark:text-gray-600">
                Create a token at: GitHub Settings → Developer settings → Personal access tokens
              </p>
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-black dark:text-black">Start Date (Optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal bg-background border-border hover:border-primary transition-smooth",
                      !startDate && "text-gray-600 dark:text-gray-400"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy") : "dd/mm/yyyy"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-background border-border" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-black dark:text-black">End Date (Optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal bg-background border-border hover:border-primary transition-smooth",
                      !endDate && "text-gray-600 dark:text-gray-400"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd/MM/yyyy") : "dd/mm/yyyy"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-background border-border" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branch Selection */}
      <Card className="shadow-card bg-gradient-card">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-black dark:text-black">Branch Selection</CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-600">
                Choose specific branches to analyze (optional)
              </p>
            </div>
            <Button 
              onClick={handleFetchBranches}
              disabled={isLoadingBranches}
              variant="outline"
              className="border-border hover:bg-muted hover:text-foreground transition-smooth"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingBranches ? 'animate-spin' : ''}`} />
              {isLoadingBranches ? "Fetching..." : "Fetch Branches"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {branches.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-gray-600 dark:text-gray-400">
                {isLoadingBranches ? 'Loading branches...' : 'No branches found for this repository'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-black dark:text-black">
                  Found {branches.length} branches. Select branches to analyze:
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                    className="text-xs border-border hover:bg-muted hover:text-foreground"
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearAll}
                    className="text-xs border-border hover:bg-muted hover:text-foreground"
                  >
                    Clear All
                  </Button>
                </div>
              </div>
              
              <div className="border border-border rounded-md p-3 max-h-48 overflow-y-auto">
                <div className="space-y-3">
                  {branches.map((branch) => (
                    <div key={branch.name} className="flex items-start space-x-3">
                      <Checkbox
                        id={`branch-${branch.name}`}
                        checked={selectedBranches.includes(branch.name)}
                        onCheckedChange={() => handleBranchToggle(branch.name)}
                        className="border-gray-400 data-[state=checked]:bg-primary data-[state=checked]:border-primary mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <GitBranch className="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                          <Label 
                            htmlFor={`branch-${branch.name}`}
                            className="text-sm text-black dark:text-black cursor-pointer font-medium"
                          >
                            {branch.name}
                          </Label>
                        </div>
                        <div className="ml-6 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                          <p>Commit SHA: {branch.commit.sha}</p>
                          <p>Protected: {branch.protected ? 'Yes' : 'No'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedBranches.length > 0 && (
                <div className="mt-4 p-3 bg-muted/30 rounded-md border border-border">
                  <p className="text-sm font-medium text-black dark:text-black mb-2">
                    {selectedBranches.length} branch{selectedBranches.length === 1 ? '' : 'es'} selected:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedBranches.map(branchName => (
                      <span 
                        key={branchName}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {branchName}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Direct Commit Analysis */}
      <Card className="shadow-card bg-gradient-card">
        <CardHeader>
          <CardTitle className="text-black dark:text-black">Direct Commit Analysis</CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-600">
            Analyze a specific commit by its hash (optional)
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="commit" className="text-sm font-medium text-black dark:text-black">
              Commit Hash
            </Label>
            <Input
              id="commit"
              placeholder="Enter full commit hash (e.g., 62b6494b9c24573bfe9b1f7cf2d96137694b80f)"
              value={commitHash}
              onChange={(e) => setCommitHash(e.target.value)}
              className="bg-background border-border hover:border-primary focus:border-primary transition-smooth"
            />
            <p className="text-xs text-gray-600 dark:text-gray-600">
              Enter the full commit hash (40 characters) to analyze a specific commit directly
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="space-y-4">
      <Button
        onClick={async () => {
          setIsAnalyzing(true);
          try {
            await handleAnalyze(); // Your existing analyze function
          } finally {
            setIsAnalyzing(false);
          }
        }}
        disabled={isAnalyzing}
        className="w-full bg-gradient-primary hover:shadow-glow transition-smooth"
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin dark:text-white" />
            <span className="dark:text-white">Analyzing...</span>
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4 dark:text-white" />
            <span className="dark:text-white">Analyze Repository</span>
          </>
        )}
      </Button>
      </div>
    </div>
  );
}