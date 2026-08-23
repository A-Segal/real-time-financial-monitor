import { expect, test } from '../../client/node_modules/@playwright/test/index.mjs'

function uniqueCurrency() {
  return `E${Date.now().toString().slice(-2)}`
}

test.describe('client navigation and transaction creation', () => {
  test('navigates from Entry to Add and Monitor', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible()

    await page.getByRole('button', { name: /Add Transaction/ }).click()
    await expect(page).toHaveURL(/#\/add$/)
    await expect(page.getByRole('heading', { name: 'Add Transaction' })).toBeVisible()

    await page.getByRole('link', { name: 'Monitor' }).click()
    await expect(page).toHaveURL(/#\/monitor$/)
    await expect(page.getByRole('heading', { name: 'Monitor' })).toBeVisible()
  })

  test('creates a transaction through the real API and shows the resulting UI state', async ({ page }) => {
    await page.goto('/#/add')
    const currency = uniqueCurrency()
    await page.getByRole('spinbutton', { name: 'Amount' }).fill('37.25')
    await page.getByRole('textbox', { name: 'Currency' }).fill(currency)
    await page.getByRole('combobox', { name: 'Initial status' }).selectOption('Pending')
    const createResponse = page.waitForResponse(
      (response) => response.url().endsWith('/api/transactions') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Create Transaction' }).click()
    const created = await (await createResponse).json()

    await expect(page).toHaveURL(/#\/monitor$/)
    await expect(page.getByRole('heading', { name: 'Monitor' })).toBeVisible()
    const row = page.getByRole('row', { name: new RegExp(created.transactionId) })
    await expect(row.getByText(currency)).toBeVisible()
    await expect(row.getByText('37.25')).toBeVisible()
  })

  for (const value of ['', '0', '-1']) {
    test(`rejects amount ${value || 'missing'} before submission`, async ({ page }) => {
      await page.goto('/#/add')
      await page.getByRole('spinbutton', { name: 'Amount' }).fill(value)
      await page.getByRole('button', { name: 'Create Transaction' }).click()
      await expect(page.getByRole('alert')).toContainText('valid positive amount')
      await expect(page).toHaveURL(/#\/add$/)
    })
  }

  test('rejects missing currency before submission', async ({ page }) => {
    await page.goto('/#/add')
    await page.getByRole('spinbutton', { name: 'Amount' }).fill('10')
    await page.getByRole('textbox', { name: 'Currency' }).fill('   ')
    await page.getByRole('button', { name: 'Create Transaction' }).click()
    await expect(page.getByRole('alert')).toContainText('currency code')
  })
})
