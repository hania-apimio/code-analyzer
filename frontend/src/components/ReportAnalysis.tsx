import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, CalendarIcon, GitBranch, Shield, RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

interface Branch {
  id: string;
  name: string;
  status?: string;
  commitDetails?: string;
}

export function ReportAnalysis() {
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

  const mockBranches: Branch[] = [
    { id: "1", name: "feature_payment", status: "Unknown", commitDetails: "Unable to fetch commit details" },
    { id: "2", name: "premium-stripe-integration", status: "Unknown", commitDetails: "Unable to fetch commit details" },
    { id: "3", name: "sophia2.0", status: "Unknown", commitDetails: "Unable to fetch commit details" },
    { id: "4", name: "main", status: "Active", commitDetails: "Latest commit available" },
    { id: "5", name: "structured_code", status: "Unknown", commitDetails: "Unable to fetch commit details" },
  ];

  const handleFetchBranches = async () => {
    setIsLoadingBranches(true);
    // Simulate API call
    setTimeout(() => {
      setBranches(mockBranches);
      setIsLoadingBranches(false);
    }, 1000);
  };

  const handleBranchToggle = (branchId: string) => {
    setSelectedBranches(prev => 
      prev.includes(branchId)
        ? prev.filter(id => id !== branchId)
        : [...prev, branchId]
    );
  };

  const handleSelectAll = () => {
    setSelectedBranches(branches.map(branch => branch.id));
  };

  const handleClearAll = () => {
    setSelectedBranches([]);
  };

  const analyzeButtonText = selectedBranches.length > 0 
    ? `Analyze Github Repository (${selectedBranches.length} branch${selectedBranches.length === 1 ? '' : 'es'})`
    : "Analyze Github Repository";

  return (
    <div className="space-y-6">
      {/* Repository Configuration */}
      <Card className="shadow-card bg-gradient-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-black dark:text-black">
            <GitBranch className="w-5 h-5 text-primary" />
            Repository Configuration
          </CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">
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
              <p className="text-xs text-gray-600 dark:text-gray-400">
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
              <p className="text-sm text-gray-600 dark:text-gray-400">
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
          {branches.length > 0 && (
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
                    <div key={branch.id} className="flex items-start space-x-3">
                      <Checkbox
                        id={`branch-${branch.id}`}
                        checked={selectedBranches.includes(branch.id)}
                        onCheckedChange={() => handleBranchToggle(branch.id)}
                        className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <GitBranch className="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                          <Label 
                            htmlFor={`branch-${branch.id}`}
                            className="text-sm text-black dark:text-black cursor-pointer font-medium"
                          >
                            {branch.name}
                          </Label>
                        </div>
                        <div className="ml-6 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                          <p>{branch.commitDetails}</p>
                          <p>{branch.status}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedBranches.length > 0 && (
                <div className="bg-muted/30 rounded-md p-3 border border-border">
                  <div className="flex items-start space-x-2">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <div>
                      <p className="text-sm font-medium text-black dark:text-black">
                        {selectedBranches.length} branch{selectedBranches.length === 1 ? '' : 'es'} selected:
                      </p>
                      <div className="mt-1 space-y-1">
                        {selectedBranches.map(branchId => {
                          const branch = branches.find(b => b.id === branchId);
                          return branch ? (
                            <p key={branchId} className="text-sm text-gray-600 dark:text-gray-400">
                              {branch.name}
                            </p>
                          ) : null;
                        })}
                      </div>
                    </div>
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
          <p className="text-sm text-gray-600 dark:text-gray-400">
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
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Enter the full commit hash (40 characters) to analyze a specific commit directly
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="space-y-4">
        <Button
          variant="outline"
          className="w-full border-border hover:bg-muted hover:text-foreground transition-smooth"
        >
          <Shield className="w-4 h-4 mr-2" />
          Verify GitHub Access
        </Button>
        <Button
          className="w-full bg-gradient-primary hover:shadow-glow transition-smooth"
        >
          {analyzeButtonText}
        </Button>
      </div>
    </div>
  );
}