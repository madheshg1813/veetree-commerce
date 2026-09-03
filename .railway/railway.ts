/**
 * Railway Infrastructure as Code.
 *
 * Replaces railway.json, which Railway now rejects outright: "Config as Code
 * (railway.json / railway.toml) is deprecated. Use Infrastructure as Code
 * (.railway/railway.ts) instead." The old file was silently ignored, which is
 * why the service kept building with the auto-detect builder rather than the
 * Dockerfile.
 *
 * Note the build context: the repo ROOT, not apps/backend. apps/backend is an
 * npm workspace and cannot resolve its dependencies from its own folder.
 */
export default {
  services: {
    "veetree-commerce": {
      build: {
        dockerfilePath: "apps/backend/Dockerfile",
      },
      deploy: {
        healthcheckPath: "/health",
        healthcheckTimeout: 300,
        restartPolicyType: "ON_FAILURE",
        restartPolicyMaxRetries: 10,
      },
    },
  },
}
