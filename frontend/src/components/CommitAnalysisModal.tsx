import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Loader2, GitCommit, User, Calendar, FileText, Plus, Minus, Code, X } from "lucide-react";

interface CommitFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface CommitAuthor {
  name: string;
  email: string;
  login?: string;
  avatar_url?: string;
}

interface CommitDetails {
  sha: string;
  message: string;
  author: CommitAuthor;
  committer: CommitAuthor;
  date: string;
  stats: {
    total: number;
    additions: number;
    deletions: number;
  };
  files: CommitFile[];
  parents: string[];
}

interface CommitAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  owner: string;
  repo: string;
  commitSha: string;
  token: string;
}

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

export function CommitAnalysisModal({ 
  isOpen, 
  onClose, 
  owner, 
  repo, 
  commitSha,
  token 
}: CommitAnalysisModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commit, setCommit] = useState<CommitDetails | null>(null);

  useEffect(() => {
    if (!isOpen || !commitSha) return;

    const fetchCommitDetails = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/repos/${owner}/${repo}/commits/${commitSha}`,
          {
            headers: {
              'X-GitHub-Token': token,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch commit details');
        }

        const data = await response.json();
        setCommit(data);
      } catch (err) {
        console.error('Error fetching commit details:', err);
        setError('Failed to load commit details. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCommitDetails();
  }, [isOpen, commitSha, owner, repo, token]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'added':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Added</Badge>;
      case 'removed':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Removed</Badge>;
      case 'modified':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Modified</Badge>;
      case 'renamed':
        return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">Renamed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCommit className="w-5 h-5" />
            Commit Analysis
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">{error}</div>
        ) : commit ? (
          <div className="space-y-6">
            {/* Commit Header */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold leading-none">
                      {commit.message.split('\n')[0]}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {commit.message.split('\n').slice(1).join('\n').trim()}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <code className="bg-muted px-2 py-1 rounded text-xs font-mono">
                      {commit.sha.substring(0, 7)}
                    </code>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Author and Committer Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Author:</span>
                      <div className="flex items-center gap-1">
                        <span>{commit.author.name || commit.author.login || 'Unknown'}</span>
                        {commit.author.email && (
                          <span className="text-muted-foreground">({commit.author.email})</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Date:</span>
                      <span>{formatDate(commit.date)}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Committer:</span>
                      <div className="flex items-center gap-1">
                        <span>{commit.committer.name || commit.committer.login || 'Unknown'}</span>
                        {commit.committer.email && (
                          <span className="text-muted-foreground">({commit.committer.email})</span>
                        )}
                      </div>
                    </div>
                    {commit.parents.length > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <GitCommit className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">Parents:</span>
                        <div className="flex gap-1 flex-wrap">
                          {commit.parents.map((parent, i) => (
                            <code key={i} className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                              {parent.substring(0, 7)}
                            </code>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg text-center">
                    <div className="flex items-center justify-center gap-1 text-green-600 dark:text-green-400">
                      <Plus className="w-4 h-4" />
                      <span className="text-lg font-bold">{commit.stats.additions}</span>
                    </div>
                    <div className="text-xs text-green-600 dark:text-green-400 mt-1">Additions</div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-center">
                    <div className="flex items-center justify-center gap-1 text-red-600 dark:text-red-400">
                      <Minus className="w-4 h-4" />
                      <span className="text-lg font-bold">{commit.stats.deletions}</span>
                    </div>
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">Deletions</div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-center">
                    <div className="flex items-center justify-center gap-1 text-blue-600 dark:text-blue-400">
                      <FileText className="w-4 h-4" />
                      <span className="text-lg font-bold">{commit.stats.total}</span>
                    </div>
                    <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">Changes</div>
                  </div>
                </div>
              </CardContent>
            </Card>


            {/* Analysis Summary */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                Type: {getCommitType(commit.message)}
              </Badge>
              <Badge variant="outline">
                Complexity: {getComplexityLevel(commit.stats.additions + commit.stats.deletions)}
              </Badge>
              <Badge variant="outline">
                Quality: {getQualityAssessment(commit.stats.additions, commit.stats.deletions, commit.files.length)}
              </Badge>
              <Badge 
                variant={
                  getRiskLevel(commit.stats.additions + commit.stats.deletions, commit.files.length) === "High"
                    ? "destructive"
                    : getRiskLevel(commit.stats.additions + commit.stats.deletions, commit.files.length) === "Medium"
                      ? "secondary"
                      : "outline"
                }
              >
                Risk: {getRiskLevel(commit.stats.additions + commit.stats.deletions, commit.files.length)}
              </Badge>
              {/* <Badge variant="outline">
                {commit.ssmCategory}
              </Badge> */}
            </div>

            {/* Changed Files */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Changed Files
                    <Badge variant="secondary" className="ml-2">
                      {commit.files.length} files
                    </Badge>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {commit.files.map((file, i) => (
                    <div 
                      key={i} 
                      className="border rounded-lg p-3"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {getStatusBadge(file.status)}
                            <span className="font-mono text-sm truncate">
                              {file.filename}
                            </span>
                          </div>
                          <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                            <span className="text-green-600 dark:text-green-400">+{file.additions}</span>
                            <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
                            <span>{file.changes} changes</span>
                          </div>
                        </div>
                      </div>
                      
                      {file.patch && (
                        <div className="mt-2">
                          <div className="text-xs font-medium mb-1 text-muted-foreground">Changes:</div>
                          <pre className="bg-muted p-2 rounded text-xs whitespace-pre-wrap break-words overflow-y-auto">
                            <code>{file.patch}</code>
                          </pre>

                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
