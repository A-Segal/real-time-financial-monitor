import { defineConfig, devices } from '../../client/node_modules/@playwright/test/index.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testsRoot = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(testsRoot, '../..')

export default defineConfig({
  testDir: testsRoot,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    channel: 'chrome',
  },
  webServer: [
    {
      command: 'dotnet run --project server/FinancialMonitor.Api/FinancialMonitor.Api/FinancialMonitor.Api.csproj --no-launch-profile --urls http://127.0.0.1:5120',
      cwd: repositoryRoot,
      url: 'http://127.0.0.1:5120/api/transactions',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm --prefix client run dev -- --host 127.0.0.1 --port 5174',
      cwd: repositoryRoot,
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
