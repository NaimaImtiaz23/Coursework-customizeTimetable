import { test, expect } from '@playwright/test';

test('desktop registration, planner, calendar export and persistence', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A good semester starts here.' })).toBeVisible();
  await page.getByRole('button', { name: /Try demo/ }).click();
  await expect(page.getByText('Alex Morgan', { exact: true })).toBeVisible();
  await expect(page.locator('.calendar-event')).toHaveCount(6);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.getByRole('textbox', { name: 'Search courses' }).fill('database');
  await expect(page.locator('.course-card')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Search courses' }).fill('');
  await page.getByRole('button', { name: 'Build my timetable' }).click();
  await page.getByLabel(/Academic Writing/).check();
  await page.getByRole('button', { name: 'Find a clash-free timetable' }).click();
  await expect(page.getByText('A clash-free combination is ready.')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm registration' }).click();
  await expect(page.locator('.enrolled-row')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('.enrolled-row')).toHaveCount(4);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export timetable' }).click();
  expect((await downloaded).suggestedFilename()).toBe('coursework-fall-2026.ics');
  await page.getByRole('button', { name: 'Remove ENG 102' }).click();
  await page.getByRole('button', { name: 'Remove course', exact: true }).click();
  await expect(page.locator('.enrolled-row')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('mobile navigation, search, dialog and layout fit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /Try demo/ }).click();
  await expect(page.locator('.calendar-event')).toHaveCount(6);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'My timetable', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your week, at a glance.' })).toBeVisible();
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await expect(page.getByText('Monday', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.getByText('Tuesday', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Build my timetable' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
