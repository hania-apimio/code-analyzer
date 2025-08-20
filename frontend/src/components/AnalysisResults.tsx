import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Users, GitCommit, GitBranch, CalendarClock, TrendingUp, TrendingDown, Minus } from "lucide-react";

export function AnalysisResults() {
  const [selectedAuthor, setSelectedAuthor] = useState("Sarib Ali");

  // Mock data
  const overviewData = {
    totalCommits: 67,
    activeDevelopers: 5,
    activeBranches: 5,
    latestActivity: "Invalid Date"
  };

  const commitData = {
    message: "created Docker file",
    author: "Sarib Ali",
    date: "19/08/2025",
    branch: "structured_code",
    hash: "4d88564",
    linesAdded: 167,
    linesRemoved: 27,
    filesChanged: 3,
    impactLevel: "Medium"
  };

  const branchData = [
    { name: "structured_code", commits: 8 },
    { name: "stripe-new-features", commits: 8 },
    { name: "premium-stripe-integration", commits: 2 },
    { name: "feature_payment", commits: 16 },
    { name: "main", commits: 33 }
  ];

  const developerData = [
    { name: "Sarib Ali", commits: 30 },
    { name: "usman2335", commits: 3 },
    { name: "hania-apimio", commits: 1 },
    { name: "Jannat Butt", commits: 6 },
    { name: "jannat-butt47", commits: 27 }
  ];

  const recentCommits = [
    {
      message: "created Docker file",
      author: "Sarib Ali",
      date: "Invalid Date",
      branch: "structured_code",
      hash: "4d88564"
    },
    {
      message: "DataTalk Bug Fixed",
      author: "Sarib Ali", 
      date: "Invalid Date",
      branch: "structured_code",
      hash: "5664d9"
    },
    {
      message: "Deployment version",
      author: "Sarib Ali",
      date: "Invalid Date", 
      branch: "structured_code",
      hash: "eb547f7"
    }
  ];

  const authorMetrics = {
    totalCommits: 21,
    linesAdded: 9570,
    linesRemoved: 2402,
    filesChanged: 140,
    qualityScore: 33,
    lowRiskScore: 33,
    simpleCommits: 24
  };

  return (
    <div className="space-y-6">
      {/* Header with Download Button */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-black dark:text-white">Analysis Results</h2>
        <Button variant="outline" className="gap-2 border-border hover:bg-muted hover:text-foreground transition-smooth text-black dark:text-white">
          <Download className="w-4 h-4" />
          Download PDF Report
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-muted">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Overview
          </TabsTrigger>
          <TabsTrigger value="developer" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Developer Performance
          </TabsTrigger>
          <TabsTrigger value="detailed" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Detailed Analysis
          </TabsTrigger>
          <TabsTrigger value="author" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Author View
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-card shadow-card">
              <CardContent className="p-6 text-center">
                <div className="text-2xl font-bold text-info">{overviewData.totalCommits}</div>
                <div className="text-sm text-muted-foreground">Total Commits</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-card shadow-card">
              <CardContent className="p-6 text-center">
                <div className="text-2xl font-bold text-success">{overviewData.activeDevelopers}</div>
                <div className="text-sm text-muted-foreground">Active Developers</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-card shadow-card">
              <CardContent className="p-6 text-center">
                <div className="text-2xl font-bold text-accent">{overviewData.activeBranches}</div>
                <div className="text-sm text-muted-foreground">Active Branches</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-card shadow-card">
              <CardContent className="p-6 text-center">
                <div className="text-2xl font-bold text-warning">{overviewData.latestActivity}</div>
                <div className="text-sm text-muted-foreground">Latest Activity</div>
              </CardContent>
            </Card>
          </div>

          {/* Latest Commit Details */}
          <Card className="bg-gradient-card shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-black dark:text-black">
                <GitCommit className="w-5 h-5 text-primary" />
                Latest Commit Details
              </CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400">Most recent activity in the repository</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-lg font-medium text-black">{commitData.message}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 ">Author:</span>
                  <div className="font-medium text-gray-400">{commitData.author}</div>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-600">Date:</span>
                  <div className="font-medium text-gray-400">{commitData.date}</div>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-600">Branch:</span>
                  <div className="font-medium text-gray-400">{commitData.branch}</div>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-600">Commit Hash:</span>
                  <div className="font-medium text-gray-400">{commitData.hash}</div>
                </div>
              </div>

              {/* Commit Analysis */}
              <div className="bg-muted rounded-lg p-4">
                <h4 className="font-medium text-black dark:text-white mb-4">Commit Analysis</h4>
                
                {/* Colored Metric Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-green-700 dark:text-green-400">+{commitData.linesAdded}</div>
                    <div className="text-xs text-green-600 dark:text-green-500">Lines Added</div>
                  </div>
                  <div className="bg-red-100 dark:bg-red-900/30 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-red-700 dark:text-red-400">-{commitData.linesRemoved}</div>
                    <div className="text-xs text-red-600 dark:text-red-500">Lines Removed</div>
                  </div>
                  <div className="bg-blue-100 dark:bg-blue-900/30 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{commitData.filesChanged}</div>
                    <div className="text-xs text-blue-600 dark:text-blue-500">Files Changed</div>
                  </div>
                  <div className="bg-purple-100 dark:bg-purple-900/30 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-purple-700 dark:text-purple-400">{commitData.impactLevel}</div>
                    <div className="text-xs text-purple-600 dark:text-purple-500">Impact Level</div>
                  </div>
                </div>

                {/* Analysis Details */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Type:</span>
                    <div className="font-medium text-black dark:text-white">other</div>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Complexity:</span>
                    <div className="font-medium text-black dark:text-white">Moderate</div>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Quality:</span>
                    <div className="font-medium text-black dark:text-white">Fair</div>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Risk:</span>
                    <div className="font-medium text-black dark:text-white">Medium</div>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Code Deletion</span>
                  </div>
                </div>

                {/* Detailed Description */}
                <div className="text-sm text-black dark:text-white bg-background rounded-lg p-3">
                  <strong>{commitData.author}</strong> made a other commit: '<strong>{commitData.message}</strong>'. This commit modified {commitData.linesAdded + commitData.linesRemoved} lines ({commitData.linesAdded} added, {commitData.linesRemoved} removed). This commit makes general changes to the codebase. This is a significant change that may affect multiple parts of the application.
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Commits by Branch and Developer */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-gradient-card shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-black dark:text-black">
                  <GitBranch className="w-5 h-5 text-primary" />
                  Commits by Branch
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {branchData.map((branch, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm font-medium text-black dark:text-white">{branch.name}</span>
                    <span className="text-sm font-semibold text-info">{branch.commits} commits</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-gradient-card shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-black dark:text-black">
                  <Users className="w-5 h-5 text-primary" />
                  Commits by Developer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {developerData.map((developer, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm font-medium text-black dark:text-white">{developer.name}</span>
                    <span className="text-sm font-semibold text-info">{developer.commits} commits</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Recent Commits */}
          <Card className="bg-gradient-card shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-black dark:text-black">
                <CalendarClock className="w-5 h-5 text-primary" />
                Recent Commits
              </CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400">Latest commits across all branches</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentCommits.map((commit, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-black dark:text-white">{commit.message}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      by {commit.author} • {commit.date} • {commit.branch}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    #{commit.hash}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Developer Performance Tab */}
        <TabsContent value="developer" className="space-y-6">
          <Card className="bg-gradient-card shadow-card">
            <CardHeader>
              <CardTitle className="text-black dark:text-black">Developer Performance Analysis</CardTitle>
              <p className="text-sm text-muted-foreground">
                Detailed performance metrics for each developer
              </p>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <p className="text-gray-600 dark:text-gray-400">Developer performance metrics will be displayed here</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Detailed Analysis Tab */}
        <TabsContent value="detailed" className="space-y-6">
          <Card className="bg-gradient-card shadow-card">
            <CardHeader>
              <CardTitle className="text-black dark:text-black">Detailed Code Analysis</CardTitle>
              <p className="text-sm text-muted-foreground">
                In-depth analysis of code changes and patterns
              </p>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <p className="text-gray-600 dark:text-gray-400">Detailed analysis results will be displayed here</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Author View Tab */}
        <TabsContent value="author" className="space-y-6">
          <Card className="bg-gradient-card shadow-card">
            <CardHeader>
              <CardTitle className="text-black dark:text-black">Author Analysis</CardTitle>
              <p className="text-sm text-muted-foreground">
                View commits and analysis for a specific author
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Author Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-black dark:text-black">Select Author</label>
                <Select value={selectedAuthor} onValueChange={setSelectedAuthor}>
                  <SelectTrigger className="bg-background border-border hover:border-primary transition-smooth">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border ">
                    <SelectItem value="Sarib Ali">Sarib Ali</SelectItem>
                    <SelectItem value="usman2335">usman2335</SelectItem>
                    <SelectItem value="hania-apimio">hania-apimio</SelectItem>
                    <SelectItem value="Jannat Butt">Jannat Butt</SelectItem>
                    <SelectItem value="jannat-butt47">jannat-butt47</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Author Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-muted">
                  <CardContent className="p-4 text-center">
                    <div className="text-xl font-bold text-info">{authorMetrics.totalCommits}</div>
                    <div className="text-xs text-muted-foreground">Total Commits</div>
                  </CardContent>
                </Card>
                <Card className="bg-muted">
                  <CardContent className="p-4 text-center">
                    <div className="text-xl font-bold text-success">+{authorMetrics.linesAdded}</div>
                    <div className="text-xs text-muted-foreground">Lines Added</div>
                  </CardContent>
                </Card>
                <Card className="bg-muted">
                  <CardContent className="p-4 text-center">
                    <div className="text-xl font-bold text-destructive">-{authorMetrics.linesRemoved}</div>
                    <div className="text-xs text-muted-foreground">Lines Removed</div>
                  </CardContent>
                </Card>
                <Card className="bg-muted">
                  <CardContent className="p-4 text-center">
                    <div className="text-xl font-bold text-accent">{authorMetrics.filesChanged}</div>
                    <div className="text-xs text-muted-foreground">Files Changed</div>
                  </CardContent>
                </Card>
              </div>

              {/* Quality Metrics */}
              <Card className="bg-muted">
                <CardHeader>
                  <CardTitle className="text-sm text-foreground">Quality Metrics for {selectedAuthor}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-success/10 rounded-lg">
                      <div className="text-2xl font-bold text-success">{authorMetrics.qualityScore}%</div>
                      <div className="text-xs text-muted-foreground">Quality Score</div>
                      <div className="text-xs text-success">7/21 good quality commits</div>
                    </div>
                    <div className="text-center p-4 bg-info/10 rounded-lg">
                      <div className="text-2xl font-bold text-info">{authorMetrics.lowRiskScore}%</div>
                      <div className="text-xs text-muted-foreground">Low Risk Score</div>
                      <div className="text-xs text-info">7/21 low risk commits</div>
                    </div>
                    <div className="text-center p-4 bg-accent/10 rounded-lg">
                      <div className="text-2xl font-bold text-accent">{authorMetrics.simpleCommits}%</div>
                      <div className="text-xs text-muted-foreground">Simple Commits</div>
                      <div className="text-xs text-accent">5/21 simple commits</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}