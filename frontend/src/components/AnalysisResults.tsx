import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Users, GitCommit, GitBranch, CalendarClock, TrendingUp, TrendingDown, Minus, CheckCircle2, User, Calendar, BarChart2, Hash } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;

// Helper functions for commit analysis
const getCommitType = (message: string): string => {
  const messageLower = message.toLowerCase();
  if (messageLower.includes('fix') || messageLower.includes('bug')) return 'Bug Fix';
  if (messageLower.includes('feat') || messageLower.includes('add')) return 'Feature';
  if (messageLower.includes('refactor')) return 'Refactor';
  if (messageLower.includes('doc')) return 'Documentation';
  if (messageLower.includes('test')) return 'Test';
  if (messageLower.includes('chore')) return 'Chore';
  return 'Other';
};

const getComplexityLevel = (totalChanges: number): string => {
  if (totalChanges < 10) return 'Simple';
  if (totalChanges < 50) return 'Moderate';
  if (totalChanges < 200) return 'Complex';
  return 'Very Complex';
};

const getQualityAssessment = (added: number, removed: number, filesChanged: number): string => {
  const changeRatio = added > 0 ? removed / added : 0;
  if (filesChanged === 0) return 'N/A';
  if (filesChanged > 10) return 'Needs Review';
  if (changeRatio > 3) return 'Questionable';
  return 'Good';
};

const getRiskLevel = (totalChanges: number, filesChanged: number): string => {
  if (filesChanged === 0) return 'None';
  if (totalChanges > 100 || filesChanged > 5) return 'High';
  if (totalChanges > 50 || filesChanged > 2) return 'Medium';
  return 'Low';
};

const getCommitAnalysisText = (commitData: any, latestCommit: any, selectedAuthor: string) => {
  const author = commitData.author_name || commitData.author_login || selectedAuthor;
  const message = commitData.message;
  const changes = commitData.linesAdded + commitData.linesRemoved;
  const filesChanged = commitData.filesChanged;
  
  let analysis = `${author} made a ${getCommitType(message).toLowerCase()} commit: "${message}". `;
  analysis += `This commit modified ${changes} lines (${commitData.linesAdded} added, ${commitData.linesRemoved} removed) across ${filesChanged} ${filesChanged === 1 ? 'file' : 'files'}. `;
  
  if (changes > 200) {
    analysis += "This is a very large change that significantly impacts the codebase. ";
  } else if (changes > 50) {
    analysis += "This is a substantial change that affects multiple parts of the application. ";
  } else if (changes > 10) {
    analysis += "This change makes focused modifications to specific functionality. ";
  } else {
    analysis += "This is a small, targeted change. ";
  }

  if (filesChanged > 5) {
    analysis += "The changes span multiple files, which may require careful review. ";
  }

  const changeRatio = commitData.linesAdded > 0 ? commitData.linesRemoved / commitData.linesAdded : 0;
  if (changeRatio > 1.5) {
    analysis += "The commit includes significant code removal relative to additions, which could indicate refactoring or cleanup. ";
  }

  return analysis;
};

// SSM Category Constants
const SSM_CATEGORIES = {
  INTEGRATION: 'Integration',
  ROLLBACK: 'Rollback',
  ARCHITECTURAL: 'Architectural',
  FEATURE: 'Feature',
  BUG_FIX: 'Bug Fix',
  REFACTORING: 'Refactoring',
  DOCUMENTATION: 'Documentation',
  TEST: 'Test',
  CONFIGURATION: 'Configuration',
  MAINTENANCE: 'Maintenance',
  TRIVIAL: 'Trivial'
} as const;

type SSMCategory = typeof SSM_CATEGORIES[keyof typeof SSM_CATEGORIES];

// Helper function to check message patterns with fuzzy matching
const hasPattern = (message: string, patterns: (string | RegExp)[]): boolean => {
  const msg = message.toLowerCase().replace(/[^\w\s]/g, ' '); // Remove special chars
  const words = msg.split(/\s+/); // Split into words
  
  return patterns.some(pattern => {
    if (pattern instanceof RegExp) {
      return pattern.test(msg);
    }
    
    const patternWords = pattern.toLowerCase().split(/\s+/);
    return patternWords.every(pw => 
      words.some(w => w.includes(pw) || pw.includes(w))
    );
  });
};

const determineSSMCategory = (commit: {
  message?: string;
  linesAdded?: number;
  linesRemoved?: number;
  filesChanged?: number;
}): SSMCategory => {
  const message = commit.message || '';
  const totalChanges = (commit.linesAdded || 0) + (commit.linesRemoved || 0);
  const filesChanged = commit.filesChanged || 0;
  const isLargeChange = totalChanges > 100 && filesChanged > 5;
  const isMediumChange = totalChanges > 50 || filesChanged > 2;

  // Integration (merges, pull requests)
  if (hasPattern(message, [
    /merge (branch|pull request|pr|changes?)/i,
    'pull request',
    'merge',
    'integrate',
    'squash',
    'rebase',
    'merge branch',
    'merge pull'
  ])) {
    return SSM_CATEGORIES.INTEGRATION;
  }

  // Rollback (reverts, rollbacks)
  if (hasPattern(message, [
    /revert/i,
    'rollback',
    'undo',
    'back out',
    'revert changes',
    'roll back'
  ])) {
    return SSM_CATEGORIES.ROLLBACK;
  }

  // Architectural changes
  if ( hasPattern(message, [
    'architectur',
    'refactor architect',
    'refactor structure',
    'refactor design',
    'major refactor',
    'restructure',
    'redesign',
    'system design',
    'architecture change'
  ])) {
    return SSM_CATEGORIES.ARCHITECTURAL;
  }

  // Feature additions
  if (hasPattern(message, [
    /feat(\(\w+\))?:/i,
    'add feature',
    'new feature',
    'implement',
    'feature implementation',
    'add new',
    'introduce',
    'create new'
  ])) {
    return SSM_CATEGORIES.FEATURE;
  }

  // Bug fixes
  if (hasPattern(message, [
    /fix(\(\w+\))?:/i,
    'bugfix',
    'bug fix',
    'fix bug',
    'fix issue',
    'fix error',
    'resolve issue',
    'bug report',
    'error fix',
    'crash fix',
    'bugs fixed'
  ])) {
    return SSM_CATEGORIES.BUG_FIX;
  }

  // Documentation
  if (hasPattern(message, [
    /docs?(\s*\(\w+\))?:/i,
    'documentation',
    'update docs',
    'improve docs',
    'add docs',
    'readme',
    'changelog',
    'license',
    'doc update',
    'update readme'
  ])) {
    return SSM_CATEGORIES.DOCUMENTATION;
  }

  // Tests
  if (hasPattern(message, [
    /test(s|ing)?(\s*\(\w+\))?:/i,
    'add test',
    'update test',
    'fix test',
    'test coverage',
    'unit test',
    'integration test',
    'testing',
    'add test case'
  ])) {
    return SSM_CATEGORIES.TEST;
  }

  // Configuration
  if (hasPattern(message, [
    'config',
    'configuration',
    'update config',
    'change setting',
    'env',
    'environment',
    'package.json',
    'webpack',
    'babel',
    'tsconfig',
    'eslint',
    'prettier',
    'setup',
    'configuration change'
  ])) {
    return SSM_CATEGORIES.CONFIGURATION;
  }

  // Refactoring
  const changeRatio = (commit.linesAdded || 0) > 0 
    ? (commit.linesRemoved || 0) / (commit.linesAdded || 1) 
    : 0;
    
  if ((changeRatio > 0.7 && changeRatio < 1.3) || 
      hasPattern(message, [
        'refactor',
        'clean up',
        'cleanup',
        'code quality',
        'improve code',
        'code cleanup',
        'optimize',
        'simplify',
        'restructure code'
      ])) {
    return SSM_CATEGORIES.REFACTORING;
  }

  // Maintenance
  if (hasPattern(message, [
    'chore',
    'maintenance',
    'update dependency',
    'bump version',
    'dependency update',
    'version bump',
    'update deps',
    'package update',
    'update packages'
  ])) {
    return SSM_CATEGORIES.MAINTENANCE;
  }

  // Size-based fallbacks
  if (totalChanges > 100) return SSM_CATEGORIES.ARCHITECTURAL; // Large changes are now considered Architectural
  if (totalChanges > 20) return SSM_CATEGORIES.TRIVIAL; // Medium changes are now considered Trivial
  
  return SSM_CATEGORIES.TRIVIAL;
};

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

interface RepoInsights {
  token:string;
  owner: string;
  repo: string;
  total_unique_commits: number;
  total_branches: number;
  total_developers: number;
  latest_activity_date: string;
  latest_commit?: {
    sha: string;
    message: string;
    branch: string;
    date: string;
    author_name: string;
    author_login?: string;
    additions?: number;
    deletions?: number;
    changes?: number;
    files?: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      changes: number;
    }>;
  };
  recent_commits?: Array<{
    sha: string;
    message: string;
    branch: string;
    date: string;
    author_name: string;
    author_login?: string;
    additions?: number;
    deletions?: number;
    changes?: number;
    files?: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      changes: number;
    }>;
  }>;
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
  }>;
  code_quality_metrics: CodeQualityMetrics;  
}

interface AnalysisResultsProps {
  insights: RepoInsights | null;
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

interface QualityMetrics {
  quality_score: number;
  good_commits: number;
  low_risk_score: number;
  low_risk_commits: number;
  simple_score: number;
  simple_commits: number;
}

interface AuthorCommitsResponse {
  author: string;
  total_commits: number;
  lines_added: number;
  lines_removed: number;
  files_changed: number;
  quality_metrics: QualityMetrics;
  commits: Commit[];
  branches: string[];
}

const CommitCard = ({ commit }) => {
  // Helper function to get badge variant based on value
  const getBadgeVariant = (value, type = 'default') => {
    if (type === 'risk') {
      if (value?.toLowerCase() === 'high') return 'destructive';
      if (value?.toLowerCase() === 'medium') return 'secondary';
      return 'default';
    }
    
    if (type === 'quality') {
      if (value?.toLowerCase() === 'excellent') return 'default';
      if (value?.toLowerCase() === 'good') return 'secondary';
      if (value?.toLowerCase() === 'fair') return 'warning';
      return 'destructive';
    }

    const numValue = typeof value === 'string' ? parseInt(value) : value;
    if (numValue >= 80) return 'default';
    if (numValue >= 50) return 'secondary';
    return 'destructive';
  };

  // Helper function to format score display
  const formatScore = (value) => {
    const num = typeof value === 'string' ? parseInt(value) : value;
    return isNaN(num) ? 'N/A' : num;
  };

  return (
    <Card className="mb-6 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3 border-b">
        <div className="flex justify-between items-start">
          <div>
            {/* Commit message */}
            <CardTitle className="text-base font-medium text-gray-900 dark:text-white">
              {commit.commit_message || "No commit message"}
            </CardTitle>

            {/* Branch, Risk, Date, Author */}
            <div className="flex items-center gap-4 mt-1 flex-wrap">

              {/* Author */}
              {commit.author_name && (
                <span className="flex items-center text-xs text-black-500">
                  <User className="w-3 h-3 mr-1" />
                  {commit.author_name}
                </span>
              )}

              {/* Branch */}
              <Badge variant="outline" className="text-xs font-normal">
                <GitBranch className="w-3 h-3 mr-1" />
                {commit.branch || "main"}
              </Badge>

              {/* Risk */}
              <Badge
                variant={
                  getRiskLevel(
                    commit.lines_added + commit.lines_removed,
                    commit.files_changed.length
                  ) === "High"
                    ? "destructive"
                    : getRiskLevel(
                        commit.lines_added + commit.lines_removed,
                        commit.files_changed.length
                      ) === "Medium"
                    ? "secondary"
                    : "outline"
                }
              >
                Risk:{" "}
                {getRiskLevel(
                  commit.lines_added + commit.lines_removed,
                  commit.files_changed
                )}
              </Badge>

              {/* Date */}
              <span className="flex items-center text-xs text-black-500">
                <Calendar className="w-3 h-3 mr-1" />
                {new Date(commit.date_of_commit).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Commit Hash */}
          <div className="flex items-center gap-2">
            <span className="flex items-center text-xs text-gray-500 font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
              <Hash className="w-3 h-3 mr-1" />
              {commit.commit_hash?.substring(0, 7) || "N/A"}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        <div className="grid grid-cols-1 gap-6">
          {/* Stats */}
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg p-3 text-center bg-white dark:bg-gray-900 border">
                <div className="text-xl font-bold text-green-600 dark:text-green-400">
                  +{commit.lines_added || 0}
                </div>
                <div className="text-xs text-gray-500">Added</div>
              </div>
              <div className="rounded-lg p-3 text-center bg-white dark:bg-gray-900 border">
                <div className="text-xl font-bold text-red-600 dark:text-red-400">
                  -{commit.lines_removed || 0}
                </div>
                <div className="text-xs text-gray-500">Removed</div>
              </div>
              <div className="rounded-lg p-3 text-center bg-white dark:bg-gray-900 border">
                <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {Array.isArray(commit.files_changed)
                    ? commit.files_changed.length
                    : 0}
                </div>
                <div className="text-xs text-gray-500">Files</div>
              </div>
            </div>

            {/* Changed Files */}
            {Array.isArray(commit.files_changed) &&
              commit.files_changed.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Changed Files
                  </h4>
                  <div className="text-xs space-y-1 overflow-y-auto bg-gray-50 dark:bg-gray-800 p-2 rounded-md">
                    {commit.files_changed.map((file, index) => (
                      <div
                        key={index}
                        className="font-mono truncate"
                        title={file}
                      >
                        {file}
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>

          {/* Metrics & File Types side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Metrics */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Metrics
              </h4>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="w-fit">
                  Type: {getCommitType(commit.commit_message)}
                </Badge>
                <Badge variant="outline" className="w-fit">
                  Complexity:{" "}
                  {getComplexityLevel(
                    commit.lines_added + commit.lines_removed
                  )}
                </Badge>
                <Badge variant="outline" className="w-fit">
                  Quality:{" "}
                  {getQualityAssessment(
                    commit.lines_added,
                    commit.lines_removed,
                    commit.filesChanged
                  )}
                </Badge>
              </div>
            </div>

            {/* File Types */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                File Types
              </h4>
              <div className="flex flex-wrap gap-2">
                {commit.file_types_involved.map((type: string, index: number) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="text-xs capitalize w-fit"
                  >
                    {type.toLowerCase()}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Scores */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Scores
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {commit.commit_specific_scores &&
                Object.entries(commit.commit_specific_scores).map(
                  ([key, value]) => {
                    const score = formatScore(value);
                    const scoreNum = typeof score === "number" ? score : 0;
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700 dark:text-gray-300 capitalize">
                            {key.replace("_", " ")}
                          </span>
                          <span className="font-medium">{score}</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2">
                          <div
                            className={`h-full rounded-full ${
                              scoreNum >= 80
                                ? "bg-green-500"
                                : scoreNum >= 50
                                ? "bg-yellow-500"
                                : "bg-red-500"
                            }`}
                            style={{ width: `${Math.min(scoreNum, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  }
                )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Add this helper function to categorize commits by both SSM category and commit type
const categorizeCommits = (commits: Commit[]) => {
  const categories = new Map<string, {count: number, types: Set<string>}>();

  commits?.forEach(commit => {
    const ssmCategory = determineSSMCategory({
      message: commit.message,
      linesAdded: commit.additions,
      linesRemoved: commit.deletions,
      filesChanged: commit.files?.length || 0
    });
    
    const commitType = getCommitType(commit.message);
    
    if (!categories.has(ssmCategory)) {
      categories.set(ssmCategory, { count: 0, types: new Set() });
    }
    
    const categoryData = categories.get(ssmCategory)!;
    categoryData.count += 1;
    categoryData.types.add(commitType);
  });

  return Array.from(categories.entries())
    .map(([category, {count, types}]) => ({
      category,
      count,
      types: Array.from(types).sort()
    }))
    .sort((a, b) => b.count - a.count);
};

export function AnalysisResults({ insights }: AnalysisResultsProps) {
  const [selectedAuthor, setSelectedAuthor] = useState(insights?.by_developer?.[0]?.username || "");
  const [authorCommits, setAuthorCommits] = useState<AuthorCommitsResponse | null>(null);
  const [isLoadingAuthorCommits, setIsLoadingAuthorCommits] = useState(false);
  const [authorCommitsError, setAuthorCommitsError] = useState<string | null>(null);
  const [personalToken, setPersonalToken] = useState("");
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const resultsRef = useRef<HTMLDivElement>(null);
  const [showCommitAnalysis, setShowCommitAnalysis] = useState(false);
  const [commitAnalysisData, setCommitAnalysisData] = useState(null);
  const [isLoadingCommitAnalysis, setIsLoadingCommitAnalysis] = useState(false);

  const toggleCommitAnalysis = () => {
    setShowCommitAnalysis((prev) => !prev);
  };

  const fetchCommitAnalysisData = async () => {
    if (commitAnalysisData) {
      setShowCommitAnalysis((prev) => !prev);
      return;
    }

    setIsLoadingCommitAnalysis(true);

    try {
      const response = await fetch(`${API_URL}/repos/${insights.owner}/${insights.repo}/detailed-commit-info`, {
        headers: {
          'X-GitHub-Token': insights.token,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch commit analysis data');
      }

      const data = await response.json();
      setCommitAnalysisData(data);
      setShowCommitAnalysis(true);
    } catch (error) {
      console.error('Error fetching commit analysis data:', error);
    } finally {
      setIsLoadingCommitAnalysis(false);
    }
  };

  // Auto-scroll to results when component mounts
  useEffect(() => {
    if (resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Add this state to store commit categories
  const [commitCategories, setCommitCategories] = useState<Array<{
    category: string;
    count: number;
    types: string[];
  }>>([]);

  // Add this effect to update categories when selected author changes
  useEffect(() => {
    if (selectedAuthor && insights?.author_metrics?.[selectedAuthor]?.commits) {
      const categories = categorizeCommits(insights.author_metrics[selectedAuthor].commits);
      setCommitCategories(categories);
    } else {
      setCommitCategories([]);
    }
  }, [selectedAuthor, insights]);

  const getAssessmentColor = (assessment: string) => {
    switch (assessment.toLowerCase()) {
      case 'excellent':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'good':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'fair':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'poor':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const MetricCard = ({ title, value, assessment, reverse = false }: { 
    title: string; 
    value: string | number;
    assessment: string;
    reverse?: boolean;
  }) => (
    <div className="flex flex-col p-4 border rounded-lg">
      <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{title}</div>
      <div className="text-2xl font-bold mb-2">{value}</div>
      <div className={`mt-auto text-xs font-medium px-2.5 py-0.5 rounded-full w-fit ${getAssessmentColor(assessment)}`}>
        {assessment.charAt(0).toUpperCase() + assessment.slice(1)}
      </div>
    </div>
  );
  

  // Show loading state if insights are not loaded yet
  if (!insights) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading repository data...</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    const fetchAuthorCommits = async () => {
      if (!selectedAuthor || !insights) return;
      
      setIsLoadingAuthorCommits(true);
      setAuthorCommitsError(null);
      
      try {
        const response = await fetch(
          `${API_URL}/repos/${insights.owner}/${insights.repo}/commits/author/${encodeURIComponent(selectedAuthor)}`,
          {
            headers: {
              'X-GitHub-Token': insights?.token,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch author commits');
        }

        const data: AuthorCommitsResponse = await response.json();
        setAuthorCommits(data);
      } catch (err) {
        setAuthorCommitsError('Failed to load author commits');
        console.error('Error fetching author commits:', err);
      } finally {
        setIsLoadingAuthorCommits(false);
      }
    };

    fetchAuthorCommits();
  }, [selectedAuthor, insights]);

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch (e) {
      return "Invalid Date";
    }
  };

  // Get top 5 branches by commit count
  const branchData = insights
    ? Object.entries(insights.per_branch || {})
        .map(([name, commits]) => ({ name, commits }))
        .sort((a, b) => b.commits - a.commits)
        .slice(0, 5)
    : [];

  // Get top 5 developers by commit count
  const developerData = insights?.by_developer?.length > 0 
    ? Array.isArray(insights.by_developer) 
      ? insights.by_developer
      : Object.entries(insights.by_developer).map(([username, commits]) => ({
          username,
          commits: Number(commits) || 0
        }))
    : [];

  // Get commit data from insights or use defaults
  const getCommitData = () => {
    if (!insights?.latest_commit) {
      return {
        message: "No recent commits found",
        author: "N/A",
        date: "N/A",
        branch: "N/A",
        hash: "",
        linesAdded: 0,
        linesRemoved: 0,
        filesChanged: 0,
        impactLevel: "Medium",
        ssmCategory: "None"
      };
    }
  
    const commit = insights.latest_commit;
    const commitData = {
      message: commit.message || "No commit message",
      author: commit.author_login || commit.author_name || "Unknown",
      date: commit.date ? formatDate(commit.date) : "N/A",
      branch: commit.branch || "main",
      hash: commit.sha ? commit.sha.substring(0, 7) : "",
      linesAdded: commit.additions || 0,
      linesRemoved: commit.deletions || 0,
      filesChanged: commit.files?.length || 0,
      impactLevel: "Medium", // Default impact level
      ssmCategory: determineSSMCategory(commit)
    };
  
    return commitData;
  };
  const commitData = getCommitData();
  const hasCommitData = insights?.latest_commit !== undefined;

  // Mock data for recent commits (since it's not in the API yet)
  const recentCommits = [
    {
      message: "Latest commit",
      author: insights?.by_developer?.[0]?.username || "N/A",
      date: insights?.latest_activity_date ? formatDate(insights.latest_activity_date) : "N/A",
      branch: insights?.latest_commit?.branch || "main",
      hash: ""
    }
  ];

  // Overview data
  const overviewData = insights
    ? {
        totalCommits: insights.total_unique_commits,
        activeDevelopers: insights.total_developers,
        activeBranches: insights.total_branches,
        latestActivity: insights.latest_activity_date ? formatDate(insights.latest_activity_date) : "N/A"
      }
    : {
        totalCommits: 0,
        activeDevelopers: 0,
        activeBranches: 0,
        latestActivity: "N/A"
      };

  // Get author metrics for the selected author
  const selectedAuthorData = selectedAuthor ? insights?.author_metrics?.[selectedAuthor] : null;

  // Format author metrics for display
  const authorMetrics = selectedAuthorData ? {
    totalCommits: selectedAuthorData.total_commits || 0,
    linesAdded: selectedAuthorData.lines_added || 0,
    linesRemoved: selectedAuthorData.lines_removed || 0,
    filesChanged: selectedAuthorData.files_changed || 0,
    qualityScore: selectedAuthorData.quality_metrics?.quality_score || 0,
    lowRiskScore: selectedAuthorData.quality_metrics?.low_risk_score || 0,
    simpleCommits: selectedAuthorData.quality_metrics?.simple_commits || 0
  } : {
    totalCommits: 0,
    linesAdded: 0,
    linesRemoved: 0,
    filesChanged: 0,
    qualityScore: 0,
    lowRiskScore: 0,
    simpleCommits: 0
  };

  // Get available authors from insights
  const availableAuthors = insights?.by_developer?.map(dev => dev.username) || [];

  // Update selected author if not set or not in available authors
  useEffect(() => {
    if (availableAuthors.length > 0 && (!selectedAuthor || !availableAuthors.includes(selectedAuthor))) {
      setSelectedAuthor(availableAuthors[0]);
    }
  }, [availableAuthors, selectedAuthor]);

  return (
    <div ref={resultsRef} className="space-y-6">
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
                <div className="text-sm text-gray-600">Total Commits</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-card shadow-card">
              <CardContent className="p-6 text-center">
                <div className="text-2xl font-bold text-success">{overviewData.activeDevelopers}</div>
                <div className="text-sm text-gray-600">Active Developers</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-card shadow-card">
              <CardContent className="p-6 text-center">
                <div className="text-2xl font-bold text-accent">{overviewData.activeBranches}</div>
                <div className="text-sm text-gray-600">Active Branches</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-card shadow-card">
              <CardContent className="p-6 text-center">
                <div className="text-2xl font-bold text-warning">{overviewData.latestActivity}</div>
                <div className="text-sm text-gray-600">Latest Activity</div>
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
              <p className="text-sm text-gray-600 dark:text-gray-600">Most recent activity in the repository</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-lg font-medium text-black">{commitData.message}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-black font-bold">Author:</span>
                  <div className="font-medium text-gray-600">{commitData.author}</div>
                </div>
                <div>
                  <span className="text-black font-bold">Date:</span>
                  <div className="font-medium text-gray-600">{commitData.date}</div>
                </div>
                <div>
                  <span className="text-black font-bold">Branch:</span>
                  <div className="font-medium text-gray-600">{commitData.branch}</div>
                </div>
                <div>
                  <span className="text-black font-bold">Commit Hash:</span>
                  <div className="font-medium text-gray-600">{commitData.hash}</div>
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

                {/* Analysis Summary */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    Type: {getCommitType(commitData.message)}
                  </Badge>
                  <Badge variant="outline">
                    Complexity: {getComplexityLevel(commitData.linesAdded + commitData.linesRemoved)}
                  </Badge>
                  <Badge variant="outline">
                    Quality: {getQualityAssessment(commitData.linesAdded, commitData.linesRemoved, commitData.filesChanged)}
                  </Badge>
                  <Badge 
                    variant={
                      getRiskLevel(commitData.linesAdded + commitData.linesRemoved, commitData.filesChanged) === "High"
                        ? "destructive"
                        : getRiskLevel(commitData.linesAdded + commitData.linesRemoved, commitData.filesChanged) === "Medium"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    Risk: {getRiskLevel(commitData.linesAdded + commitData.linesRemoved, commitData.filesChanged)}
                  </Badge>
                  <Badge variant="outline">
                    {commitData.ssmCategory}
                  </Badge>
                </div>

                {/* Detailed Analysis */}
                <div className="mt-4 p-3 bg-background/50 rounded-lg border">
                  <p className="text-foreground text-sm">
                    {getCommitAnalysisText({
                      ...commitData,
                      author_name: commitData.author,
                      author_login: commitData.author
                    }, insights?.latest_commit, selectedAuthor || commitData.author)}
                  </p>
                </div>

                {/* Changed Files */}
                {hasCommitData && insights.latest_commit?.files && insights.latest_commit.files.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium text-black dark:text-white mb-2">Changed Files ({commitData.filesChanged})</h4>
                    <div className="bg-muted/50 rounded-lg p-3 max-h-40 overflow-y-auto">
                      {insights.latest_commit.files.map((file, index) => (
                        <div key={index} className="flex justify-between items-center py-1 text-sm">
                          <span className="font-mono text-xs truncate">{file.filename}</span>
                          <div className="flex gap-2 ml-2">
                            {file.additions > 0 && (
                              <span className="text-green-600 dark:text-green-400">+{file.additions}</span>
                            )}
                            {file.deletions > 0 && (
                              <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Code Quality Metrics */}
          <Card className="bg-gradient-card shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-black dark:text-black">
                <BarChart2 className="w-5 h-5 text-primary" />
                Code Quality Metrics
              </CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-600">Analysis of code quality and risk metrics</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {insights?.code_quality_metrics && (
                  <>
                    <MetricCard 
                      title="Lines of Code" 
                      value={insights.code_quality_metrics.total_loc.value.toLocaleString()}
                      assessment={insights.code_quality_metrics.total_loc.assessment}
                    />
                    <MetricCard 
                      title="Avg. Commit Size" 
                      value={insights.code_quality_metrics.avg_commit_size.value}
                      assessment={insights.code_quality_metrics.avg_commit_size.assessment}
                      reverse
                    />
                    <MetricCard 
                      title="Code Churn (30d)" 
                      value={`${insights.code_quality_metrics.code_churn_rate.value}%`}
                      assessment={insights.code_quality_metrics.code_churn_rate.assessment}
                      reverse
                    />
                    <MetricCard 
                      title="Commit Msg Quality" 
                      value={`${insights.code_quality_metrics.commit_message_quality.value}%`}
                      assessment={insights.code_quality_metrics.commit_message_quality.assessment}
                    />
                    <MetricCard 
                      title="Comment Density" 
                      value={`${insights.code_quality_metrics.comment_density.value}%`}
                      assessment={insights.code_quality_metrics.comment_density.assessment}
                    />
                    <MetricCard 
                      title="Technical Debt" 
                      value={insights.code_quality_metrics.technical_debt_score.value}
                      assessment={insights.code_quality_metrics.technical_debt_score.assessment}
                      reverse
                    />
                    <MetricCard 
                      title="Code Smells" 
                      value={insights.code_quality_metrics.code_smells.value}
                      assessment={insights.code_quality_metrics.code_smells.assessment}
                      reverse
                    />
                    <MetricCard 
                      title="Test Coverage" 
                      value={insights.code_quality_metrics.test_coverage.value ? `${insights.code_quality_metrics.test_coverage.value}%` : 'N/A'}
                      assessment={insights.code_quality_metrics.test_coverage.assessment}
                    />
                    <MetricCard 
                      title="Security Warnings" 
                      value={insights.code_quality_metrics.security_warnings.value}
                      assessment={insights.code_quality_metrics.security_warnings.assessment}
                      reverse
                    />
                  </>
                )}
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
                    <span className="text-sm font-medium text-black dark:text-white">{developer.username}</span>
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
              <p className="text-sm text-gray-600 dark:text-gray-600">Latest commits across all branches</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {insights?.recent_commits?.slice(0, 5).map((commit, index) => (
                <div key={index} className="flex items-start p-4 bg-muted rounded-lg gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-black dark:text-white">
                      {commit.message}
                      <span className="ml-2 inline-flex items-center text-xs text-blue-600 bg-muted px-2 py-0.5 rounded">
                        <GitBranch className="w-3 h-3 mr-1" />
                        {commit.branch}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400 mt-1">
                      <span className="flex items-center">
                        <User className="w-3.5 h-3.5 mr-1" />
                        {commit.author_name}
                      </span>
                      <span className="flex items-center">
                        <Calendar className="w-3.5 h-3.5 mr-1" />
                        {commit.date.split('T')[0]}
                      </span>
                      <span className="text-xs text-gray-600 dark:text-gray-300 font-mono">
                        #{commit.sha.substring(0, 7)}
                      </span>
                    </div>
                  </div>
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
              <p className="text-sm text-muted-foreground dark:text-gray-600">
                In-depth analysis of code changes and patterns
              </p>
            </CardHeader>
            <CardContent>
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
                    <span className="text-sm font-medium text-black dark:text-white">{developer.username}</span>
                    <span className="text-sm font-semibold text-info">{developer.commits} commits</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Recent Commits */}
          <Card className="bg-gradient-card shadow-card mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-black dark:text-black">
                <CalendarClock className="w-5 h-5 text-primary" />
                Recent Commits
              </CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-600">Latest commits across all branches</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {insights?.recent_commits?.slice(0, 5).map((commit, index) => (
                <div key={index} className="flex items-start p-4 bg-muted rounded-lg gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-black dark:text-white">
                      {commit.message}
                      <span className="ml-2 inline-flex items-center text-xs text-blue-600 bg-muted px-2 py-0.5 rounded">
                        <GitBranch className="w-3 h-3 mr-1" />
                        {commit.branch}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400 mt-1">
                      <span className="flex items-center">
                        <User className="w-3.5 h-3.5 mr-1" />
                        {commit.author_name}
                      </span>
                      <span className="flex items-center">
                        <Calendar className="w-3.5 h-3.5 mr-1" />
                        {commit.date.split('T')[0]}
                      </span>
                      <span className="text-xs text-gray-600 dark:text-gray-300 font-mono">
                        #{commit.sha.substring(0, 7)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          
          <Button onClick={fetchCommitAnalysisData} className="mt-4" disabled={isLoadingCommitAnalysis}>
            {isLoadingCommitAnalysis ? "Loading..." : showCommitAnalysis ? "Hide Per-Commit Analysis" : "Show Per-Commit Analysis"}
          </Button>

          {showCommitAnalysis && commitAnalysisData && (
            <div className="transition-all duration-300 ease-in-out">
              <Card className="bg-gradient-card shadow-card mt-4">
                <CardHeader>
                  <CardTitle className="text-black dark:text-black">Commit Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  {commitAnalysisData.detailed_commit_info.map((commit, index) => (
                    <CommitCard key={index} commit={commit} />
                  ))}
                </CardContent>
              </Card>
            
            </div>
          )}
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
                    <SelectValue placeholder="Select an author" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border">
                    {developerData.map((developer) => (
                      <SelectItem key={developer.username} value={developer.username}>
                        {developer.username}
                      </SelectItem>
                    ))}
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
                      {/* <div className="text-xs text-success">7/21 good quality commits</div> */}
                    </div>
                    <div className="text-center p-4 bg-info/10 rounded-lg">
                      <div className="text-2xl font-bold text-info">{authorMetrics.lowRiskScore}%</div>
                      <div className="text-xs text-muted-foreground">Low Risk Score</div>
                      {/* <div className="text-xs text-info">7/21 low risk commits</div> */}
                    </div>
                    <div className="text-center p-4 bg-accent/10 rounded-lg">
                      <div className="text-2xl font-bold text-accent">{authorMetrics.simpleCommits}%</div>
                      <div className="text-xs text-muted-foreground">Simple Commits</div>
                      {/* <div className="text-xs text-accent">5/21 simple commits</div> */}
                    </div>
                  </div>
                </CardContent>
              </Card>

              
              {/* All Commits Section */}
              <Card className="bg-gradient-card shadow-card">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-black dark:text-black">All Commits by {selectedAuthor}</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Sort by:</span>
                      <Select 
                      value={sortOrder}
                      onValueChange={(value: 'newest' | 'oldest') => setSortOrder(value)}
                      >
                        <SelectTrigger className="w-[120px] bg-background border-border">
                          <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="newest">Newest</SelectItem>
                          <SelectItem value="oldest">Oldest</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                {selectedAuthor && insights?.author_metrics?.[selectedAuthor]?.commits ? (
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    {insights.author_metrics[selectedAuthor].commits
                      .sort((a, b) => {const dateA = new Date(a.date).getTime();
                        const dateB = new Date(b.date).getTime();
                        return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
                        })
                      .map((commit) => (
                        <div key={commit.sha} className="p-4 bg-muted rounded-lg">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="w-5 h-5 text-primary" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <h4 className="font-medium text-foreground truncate">
                                  {commit.message || 'No commit message'}
                                </h4>
                                <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                                  {commit.date ? new Date(commit.date).toLocaleDateString() : 'N/A'}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-sm text-blue-600">
                                {commit.branches?.[0] && (
                                  <span className="flex items-center">
                                    <GitBranch className="w-3.5 h-3.5 mr-1" />
                                    {commit.branches[0]}
                                  </span>
                                )}
                                {commit.sha && (
                                  <span className="text-xs font-mono bg-muted-foreground/10 px-2 py-0.5 rounded">
                                    {commit.sha.substring(0, 7)}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 mt-2 text-sm">
                                {commit.additions > 0 && (
                                  <span className="text-green-600 dark:text-green-400">+{commit.additions} added</span>
                                )}
                                {commit.deletions > 0 && (
                                  <span className="text-red-600 dark:text-red-400">-{commit.deletions} removed</span>
                                )}
                                {commit.files && commit.files.length > 0 && (
                                  <span className="text-muted-foreground">{commit.files.length} files changed</span>
                                )}
                              </div>

                              {/* Analysis Summary */}
                              <div className="flex flex-wrap gap-2 mt-2">
                                <Badge variant="outline" className="text-xs">
                                  Type: {getCommitType(commit.message || '')}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  Complexity: {getComplexityLevel((commit.additions || 0) + (commit.deletions || 0))}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  Quality: {getQualityAssessment(
                                    commit.additions || 0,
                                    commit.deletions || 0,
                                    commit.files?.length || 0
                                  )}
                                </Badge>
                                <Badge 
                             
                             variant={
                                    getRiskLevel(
                                      (commit.additions || 0) + (commit.deletions || 0),
                                      commit.files?.length || 0
                                    ) === "High"
                                      ? "destructive"
                                      : getRiskLevel(
                                          (commit.additions || 0) + (commit.deletions || 0),
                                          commit.files?.length || 0
                                        ) === "Medium"
                                      ? "secondary"
                                      : "outline"
                                  }
                                  className="text-xs"
                                >
                                  Risk: {getRiskLevel(
                                    (commit.additions || 0) + (commit.deletions || 0),
                                    commit.files?.length || 0
                                  )}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {determineSSMCategory({
                                    message: commit.message || '',
                                    linesAdded: commit.additions || 0,
                                    linesRemoved: commit.deletions || 0,
                                    filesChanged: commit.files?.length || 0
                                  })}
                                </Badge>
                              </div>

                              {/* Detailed Analysis */}
                              <div className="mt-2 p-2 bg-background/50 rounded border text-xs">
                                {getCommitAnalysisText({
                                  message: commit.message || '',
                                  linesAdded: commit.additions || 0,
                                  linesRemoved: commit.deletions || 0,
                                  filesChanged: commit.files?.length || 0,
                                  date: commit.date,
                                  author_name: commit.author_name || commit.author_login || selectedAuthor,
                                  author_login: commit.author_login || selectedAuthor
                                }, commit, selectedAuthor)}
                              </div>

                              {commit.files && commit.files.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {commit.files.slice(0, 3).map((file, fileIndex) => (
                                    <span 
                                      key={fileIndex} 
                                      className="text-xs bg-muted-foreground/10 text-muted-foreground px-2 py-0.5 rounded"
                                    >
                                      {file.filename.split('/').pop()}
                                      {fileIndex === 2 && commit.files.length > 3 && ` +${commit.files.length - 3} more`}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No commits found for this author
                  </div>
                )}
              </CardContent>
              </Card>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card shadow-card">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-black dark:text-black">Commit Categories for {selectedAuthor}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
              {/* Commit Types and Categories - Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                   {/* Commit Categories */}
                   <Card className="bg-muted">
                      <CardHeader>
                        <CardTitle className="text-sm text-foreground">By SSM Category</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {commitCategories.length > 0 ? (
                            commitCategories.map(({category, count}) => {
                              const totalCommits = insights?.author_metrics?.[selectedAuthor]?.commits?.length || 1;
                              const percentage = Math.round((count / totalCommits) * 100);
                              
                              const getCategoryColor = (cat: string) => {
                                switch(cat) {
                                  case SSM_CATEGORIES.INTEGRATION: return 'bg-blue-500';
                                  case SSM_CATEGORIES.ROLLBACK: return 'bg-red-500';
                                  case SSM_CATEGORIES.ARCHITECTURAL: return 'bg-purple-500';
                                  case SSM_CATEGORIES.FEATURE: return 'bg-green-500';
                                  case SSM_CATEGORIES.BUG_FIX: return 'bg-yellow-500';
                                  case SSM_CATEGORIES.REFACTORING: return 'bg-indigo-500';
                                  case SSM_CATEGORIES.DOCUMENTATION: return 'bg-cyan-500';
                                  case SSM_CATEGORIES.TEST: return 'bg-pink-500';
                                  case SSM_CATEGORIES.CONFIGURATION: return 'bg-orange-500';
                                  case SSM_CATEGORIES.MAINTENANCE: return 'bg-gray-500';
                                  case SSM_CATEGORIES.TRIVIAL: return 'bg-gray-300';
                                  default: return 'bg-blue-500';
                                }
                              };

                              return (
                                <div key={category} className="space-y-1">
                                  <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium">{category}</span>
                                      <span className="text-xs text-muted-foreground">
                                        {count} commit{count !== 1 ? 's' : ''} ({percentage}%)
                                      </span>
                                    </div>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                                    <div 
                                      className={`h-full ${getCategoryColor(category)}`}
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-sm text-muted-foreground">No commit data available</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                    
                    {/* Commit Types */}
                    <Card className="bg-muted">
                      <CardHeader>
                        <CardTitle className="text-sm text-foreground">By Commit Type</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {commitCategories.length > 0 ? (
                            <div className="space-y-4">
                              {/* Calculate type counts across all categories */}
                              {(() => {
                                const typeCounts = new Map<string, number>();
                                const totalCommits = insights?.author_metrics?.[selectedAuthor]?.commits?.length || 1;
                                
                                // Count all commit types
                                insights?.author_metrics?.[selectedAuthor]?.commits?.forEach(commit => {
                                  const type = getCommitType(commit.message);
                                  typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
                                });

                                // Convert to array and sort by count (descending)
                                const sortedTypes = Array.from(typeCounts.entries())
                                  .sort((a, b) => b[1] - a[1]);

                                // Map of type to color
                                const getTypeColor = (type: string) => {
                                  switch(type.toLowerCase()) {
                                    case 'feature': return 'bg-green-500';
                                    case 'bug fix': return 'bg-red-500';
                                    case 'refactor': return 'bg-blue-500';
                                    case 'documentation': return 'bg-cyan-500';
                                    case 'test': return 'bg-purple-500';
                                    case 'chore': return 'bg-gray-500';
                                    default: return 'bg-yellow-500';
                                  }
                                };

                                return sortedTypes.map(([type, count]) => {
                                  const percentage = Math.round((count / totalCommits) * 100);
                                  return (
                                    <div key={type} className="space-y-1">
                                      <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium">{type}</span>
                                          <span className="text-xs text-muted-foreground">
                                            {count} commit{count !== 1 ? 's' : ''} ({percentage}%)
                                          </span>
                                        </div>
                                      </div>
                                      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                                        <div 
                                          className={`h-full ${getTypeColor(type)}`}
                                          style={{ width: `${percentage}%` }}
                                        />
                                      </div>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No commit data available</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  </CardContent>
                </Card>

        </TabsContent>
      </Tabs>
    </div>
  );
}