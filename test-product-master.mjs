import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log('Navigating to local app...');
    // Ensure we go to the right page and wait for it to load
    await page.goto('http://localhost:5173');
    
    // The app does NOT use URL routing, it uses state 'activeTab'. 
    // We must click the bottom nav element.
    console.log('Navigating to Product Master...');
    await page.click('button:has-text("商品マスター")');
    await page.waitForSelector('h2:has-text("商品マスター")');

    console.log('Testing Vegetable CSV Import...');
    const fileChooserPromiseVeg = page.waitForEvent('filechooser');
    await page.click('button:has-text("野菜CSV取込")');
    const fileChooserVeg = await fileChooserPromiseVeg;
    await fileChooserVeg.setFiles('./test_veg.csv');

    // Wait and verify Vegetable items
    await page.waitForSelector('h4:has-text("キャベツ")');
    await page.waitForSelector('h4:has-text("レタス")');
    await page.waitForSelector('h4:has-text("トマト")');
    await page.waitForSelector('h4:has-text("トマト（高糖度）")');
    console.log('Vegetable items imported successfully.');

    console.log('Testing Fruit CSV Import...');
    const fileChooserPromiseFruit = page.waitForEvent('filechooser');
    await page.click('button:has-text("果物CSV取込")');
    const fileChooserFruit = await fileChooserPromiseFruit;
    await fileChooserFruit.setFiles('./test_fruit.csv');

    // Wait and verify Fruit items
    await page.waitForSelector('h4:has-text("りんご")');
    await page.waitForSelector('h4:has-text("みかん")');
    await page.waitForSelector('h4:has-text("バナナ")');
    console.log('Fruit items imported successfully.');

    console.log('Testing Filter: 野菜...');
    await page.selectOption('select', '野菜');
    // Ensure vegetable is visible, fruit is hidden
    let cabCount = await page.locator('h4:has-text("キャベツ")').count();
    let appleCount = await page.locator('h4:has-text("りんご")').count();
    if (cabCount === 0 || appleCount > 0) throw new Error("Filter '野菜' failed.");
    console.log('Filter 野菜 works.');

    console.log('Testing Filter: 果物...');
    await page.selectOption('select', '果物');
    // Ensure fruit is visible, vegetable is hidden
    cabCount = await page.locator('h4:has-text("キャベツ")').count();
    appleCount = await page.locator('h4:has-text("りんご")').count();
    if (appleCount === 0 || cabCount > 0) throw new Error("Filter '果物' failed.");
    console.log('Filter 果物 works.');

    console.log('Testing Filter: すべて...');
    await page.selectOption('select', 'すべて');
    cabCount = await page.locator('h4:has-text("キャベツ")').count();
    appleCount = await page.locator('h4:has-text("りんご")').count();
    if (cabCount === 0 || appleCount === 0) throw new Error("Filter 'すべて' failed.");
    console.log('Filter すべて works.');

    console.log('Testing Search Normalization...');
    await page.fill('input[placeholder*="検索"]', 'ﾄﾏﾄ');
    let tomatoCount = await page.locator('h4:has-text("トマト")').count();
    if (tomatoCount < 2) throw new Error("Search normalization (half-width kana to full-width) failed.");

    await page.fill('input[placeholder*="検索"]', 'とまと');
    tomatoCount = await page.locator('h4:has-text("トマト")').count();
    if (tomatoCount < 2) throw new Error("Search normalization (hiragana to katakana) failed.");

    await page.fill('input[placeholder*="検索"]', '００１');
    cabCount = await page.locator('h4:has-text("キャベツ")').count();
    if (cabCount === 0) throw new Error("Search normalization (full-width numbers) failed.");
    console.log('Search normalization filters correctly.');

    console.log('Navigating to Inventory...');
    await page.click('button:has-text("棚卸し")');
    await page.waitForSelector('h3:has-text("商品検索")');

    console.log('Testing Inventory Search...');
    await page.fill('input[placeholder*="検索"]', 'ﾄﾏﾄ');
    tomatoCount = await page.locator('h4:has-text("トマト")').count();
    if (tomatoCount === 0) throw new Error("Inventory search normalization (katakana) failed.");
    
    await page.fill('input[placeholder*="検索"]', 'とまと');
    tomatoCount = await page.locator('h4:has-text("トマト")').count();
    if (tomatoCount === 0) throw new Error("Inventory search normalization (hiragana) failed.");
    
    console.log('Inventory search works.');

    console.log('All tests passed successfully!');
    await browser.close();
})();
