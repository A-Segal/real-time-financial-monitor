import { expect, test, type APIRequestContext } from '../../client/node_modules/@playwright/test/index.mjs'

const apiBaseUrl = 'http://127.0.0.1:5120'

async function createPending(request: APIRequestContext) {
  const response = await request.post(`${apiBaseUrl}/api/transactions`, {
    data: { amount: 11.25, currency: `R${Date.now().toString().slice(-2)}`, status: 'Pending' },
  })
  expect(response.ok()).toBeTruthy()
  return response.json()
}

test.describe('real-time transaction synchronization', () => {
  test('delivers TransactionCreated to a second browser without refresh', async ({ browser, request }) => {
    const clientA = await browser.newContext()
    const clientB = await browser.newContext()
    const pageB = await clientB.newPage()

    await pageB.goto('/#/monitor')
    await expect(pageB.getByRole('heading', { name: 'Monitor' })).toBeVisible()
    const created = await createPending(request)

    await expect(pageB.getByText(created.currency)).toBeVisible()
    await expect(pageB.getByText(created.transactionId)).toHaveCount(1)

    await clientA.close()
    await clientB.close()
  })

  test('synchronizes a status change between two monitors and survives refresh', async ({ browser, request }) => {
    const created = await createPending(request)
    const clientA = await browser.newContext()
    const clientB = await browser.newContext()
    const pageA = await clientA.newPage()
    const pageB = await clientB.newPage()

    await pageA.goto('/#/monitor')
    await pageB.goto('/#/monitor')
    const selectorA = pageA.getByRole('combobox', { name: `Update status for ${created.transactionId}` })
    await expect(selectorA).toBeVisible()
    await expect(pageB.getByText(created.transactionId)).toBeVisible()

    await selectorA.selectOption('Completed')
    const rowA = pageA.getByRole('row', { name: new RegExp(created.transactionId) })
    const rowB = pageB.getByRole('row', { name: new RegExp(created.transactionId) })
    await expect(rowA.getByRole('cell', { name: 'Completed' })).toBeVisible()
    await expect(rowB.getByRole('cell', { name: 'Completed' })).toBeVisible()
    await expect(pageA.getByRole('combobox', { name: `Update status for ${created.transactionId}` })).toHaveCount(0)
    await expect(pageB.getByRole('combobox', { name: `Update status for ${created.transactionId}` })).toHaveCount(0)

    await pageB.reload()
    await expect(pageB.getByRole('row', { name: new RegExp(created.transactionId) }).getByRole('cell', { name: 'Completed' })).toBeVisible()
    await clientA.close()
    await clientB.close()
  })

  test('allows Pending to Failed through the real API and SignalR path', async ({ page, request }) => {
    const created = await createPending(request)
    await page.goto('/#/monitor')
    const selector = page.getByRole('combobox', { name: `Update status for ${created.transactionId}` })
    await selector.selectOption('Failed')
    const row = page.getByRole('row', { name: new RegExp(created.transactionId) })
    await expect(row.getByRole('cell', { name: 'Failed' })).toBeVisible()
    await expect(selector).toHaveCount(0)
  })

  test('recovers after a browser disconnect and processes a later created event once', async ({ browser, request }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto('/#/monitor')
    await expect(page.getByRole('heading', { name: 'Monitor' })).toBeVisible()

    await context.setOffline(true)
    await context.setOffline(false)
    const created = await createPending(request)

    const row = page.getByRole('row', { name: new RegExp(created.transactionId) })
    await expect(row).toHaveCount(1)
    await expect(row.getByText(created.currency)).toBeVisible()
    await context.close()
  })

  test('serializes concurrent terminal updates to one final backend state', async ({ browser, request }) => {
    const created = await createPending(request)
    const clientA = await browser.newContext()
    const clientB = await browser.newContext()
    const pageA = await clientA.newPage()
    const pageB = await clientB.newPage()
    await pageA.goto('/#/monitor')
    await pageB.goto('/#/monitor')
    const selectorA = pageA.getByRole('combobox', { name: `Update status for ${created.transactionId}` })
    const selectorB = pageB.getByRole('combobox', { name: `Update status for ${created.transactionId}` })
    await expect(selectorA).toBeVisible()
    await expect(selectorB).toBeVisible()

    await Promise.all([selectorA.selectOption('Completed'), selectorB.selectOption('Failed')])
    const response = await request.get('/api/transactions')
    const rows = await response.json()
    const finalRow = rows.find((row: { transactionId: string }) => row.transactionId === created.transactionId)
    expect(['Completed', 'Failed']).toContain(finalRow.status)
    await expect(pageA.getByRole('row', { name: new RegExp(created.transactionId) }).getByText(finalRow.status)).toBeVisible()
    await expect(pageB.getByRole('row', { name: new RegExp(created.transactionId) }).getByText(finalRow.status)).toBeVisible()
    await clientA.close()
    await clientB.close()
  })

  test('reports 409 for a terminal transaction without changing its state', async ({ request }) => {
    const created = await createPending(request)
    const completed = await request.put(`${apiBaseUrl}/api/transactions/${created.transactionId}/status`, {
      data: { status: 'Completed' },
    })
    expect(completed.status()).toBe(204)

    const rejected = await request.put(`${apiBaseUrl}/api/transactions/${created.transactionId}/status`, {
      data: { status: 'Failed' },
    })
    expect(rejected.status()).toBe(409)

    const rows = await (await request.get(`${apiBaseUrl}/api/transactions`)).json()
    const finalRow = rows.find((row: { transactionId: string }) => row.transactionId === created.transactionId)
    expect(finalRow.status).toBe('Completed')
  })
})
