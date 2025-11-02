import { useCallback } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRepositoryService } from '@frontend/hooks/useRepositoryService';

/**
 * Hook for GitHub OAuth integration
 *
 * @example
 * ```tsx
 * function GitHubConnect() {
 *   const { status, isConnected, connectGitHub, disconnectGitHub, isLoading } = useGitHubAuth();
 *
 *   if (isConnected) {
 *     return (
 *       <div>
 *         Connected as {status?.username}
 *         <button onClick={() => disconnectGitHub.mutate()}>Disconnect</button>
 *       </div>
 *     );
 *   }
 *
 *   return <button onClick={connectGitHub}>Connect GitHub</button>;
 * }
 * ```
 */
export function useGitHubAuth() {
  const repositoryService = useRepositoryService();
  const queryClient = useQueryClient();

  // Query GitHub connection status
  const {
    data: status,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['github', 'status'],
    queryFn: async () => {
      const result = await repositoryService.getGitHubStatus();
      if (result.error) {
        throw result.error;
      }
      return result.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });

  // Mutation for disconnecting GitHub
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const result = await repositoryService.disconnectGitHub();
      if (result.error) {
        throw result.error;
      }
      return result.data;
    },
    onSuccess: () => {
      // Invalidate and refetch GitHub status
      queryClient.invalidateQueries({ queryKey: ['github', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['github', 'repositories'] });
    },
  });

  // Function to initiate GitHub OAuth flow
  const connectGitHub = useCallback(async () => {
    try {
      // Make an authenticated request to get the authorization URL
      const result = await repositoryService.initiateGitHubAuth();
      if (result.error || !result.data) {
        console.error('Failed to initiate GitHub auth:', result.error);
        return;
      }

      // Redirect to GitHub authorization URL
      window.location.href = result.data.authUrl;
    } catch (error) {
      console.error('Failed to connect GitHub:', error);
    }
  }, [repositoryService]);

  return {
    status: status || null,
    isConnected: status?.connected ?? false,
    isLoading,
    error,
    connectGitHub,
    disconnectGitHub: disconnectMutation,
  };
}
