import { expect, type Locator, type Page, test } from '@playwright/test'

// 玩家完整旅程 e2e（T29）：按真人游玩路径固化核心循环——
// 启动页选形象 → 入门指引 → 任务堂先学后测 → 领奖打卡 → 播种/浇灌/吐纳 → 坊市 → 结束一天日结算。
// 每个用例独立浏览器上下文，localStorage 互不污染；存档键 lingzhiji.save.v1 即真相源。

const SAVE_KEY = 'lingzhiji.save.v1'

// 点击兜底：弹窗滚动与进出场动效会让 actionability 校验偶发超时，
// 第一次按真实路径点击，失败才 force（跳过校验直击元素中心），并在引擎侧有幂等防护兜底
async function clickButton(locator: Locator): Promise<void> {
  try {
    await locator.click({ timeout: 3000 })
  } catch {
    await locator.click({ force: true, timeout: 3000 })
  }
}

// 读当前存档：断言资源与引擎状态的真相源，避免依赖顶栏 DOM 顺序
async function readSave(page: Page): Promise<{
  day: number
  resources: { stones: number; contribution: number; qi: number; insight: number }
  cultivation: number
  quizDone: boolean
  streakCount: number
}> {
  return page.evaluate((key) => {
    const game = JSON.parse(localStorage.getItem(key) ?? '{}').game
    return {
      day: game.day,
      resources: game.resources,
      cultivation: game.cultivation,
      quizDone: game.quizDaily.done,
      streakCount: game.streak.count,
    }
  }, SAVE_KEY)
}

// 任务堂答题循环：优先按 learnMap 点正确释义（满分路径），无映射时点第一个可用选项（未合格路径）
async function answerQuiz(page: Page, learnMap: Record<string, string>): Promise<void> {
  const dialog = page.getByRole('dialog', { name: '任务堂' })
  for (let i = 0; i < 10; i++) {
    const word = await dialog.locator('.font-serif.text-4xl').textContent()
    const meaning = word ? learnMap[word.trim()] : undefined
    const option = meaning
      ? dialog.getByRole('button', { name: meaning, exact: true })
      : dialog.locator('.grid button:not([disabled])').first()
    await clickButton(option)
    // 作答后出现对错反馈与「下一题」（第 10 题为「查看结果」）
    await expect(dialog.getByRole('button', { name: /下一题|查看结果/ })).toBeVisible()
    await clickButton(dialog.getByRole('button', { name: /下一题|查看结果/ }))
  }
  // 结果页分数与放行文案
  await expect(dialog.getByText(/合格|未达合格线/)).toBeVisible()
}

// 从任务堂学习页抓取「词 → 释义」映射：新档首场 10 词全部来自该页展示
async function captureLearnMap(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const cards = document.querySelectorAll('[role="dialog"] .grid.grid-cols-1 > div')
    const map: Record<string, string> = {}
    cards.forEach((card) => {
      const word = card.querySelector('.font-serif')?.textContent?.trim()
      const meaning = card.querySelector('.leading-6')?.textContent?.trim()
      if (word && meaning) map[word] = meaning
    })
    return map
  })
}

// 从启动页开新档并走完（或跳过）三步指引
async function startNewGame(page: Page, tutorial: 'finish' | 'skip'): Promise<void> {
  await page.goto('/lingzhiji/')
  await expect(page.getByRole('heading', { name: '灵植记' })).toBeVisible()
  await expect(page.getByRole('radio', { name: /可爱小师妹/ })).toBeChecked()
  await clickButton(page.getByRole('button', { name: '以此形象开始修行' }))

  const tutorialDialog = page.getByRole('dialog', { name: '入门指引' })
  await expect(tutorialDialog).toBeVisible()
  if (tutorial === 'skip') {
    await clickButton(tutorialDialog.getByRole('button', { name: '跳过指引' }))
  } else {
    await clickButton(tutorialDialog.getByRole('button', { name: '下一步' }))
    await expect(tutorialDialog.getByText('播种的条件')).toBeVisible()
    await clickButton(tutorialDialog.getByRole('button', { name: '下一步' }))
    await expect(tutorialDialog.getByText('首月定额免罚')).toBeVisible()
    await clickButton(tutorialDialog.getByRole('button', { name: '开始修行' }))
  }
  await expect(tutorialDialog).toBeHidden()
  await expect(page.getByRole('heading', { name: '我的灵田' })).toBeVisible()
}

// 完成当日任务：选四级词库 → 先学（抓词表）→ 后测 → 确认领奖
async function finishDailyQuiz(page: Page, mode: 'fullScore' | 'allWrong'): Promise<void> {
  await clickButton(page.getByRole('button', { name: /任务堂 · 今日未完成/ }))
  const dialog = page.getByRole('dialog', { name: '任务堂' })
  await expect(dialog.getByText('今日功课')).toBeVisible()
  await clickButton(dialog.getByRole('button', { name: /英语四级/ }))
  await clickButton(dialog.getByRole('button', { name: '开始今日任务' }))

  // 先学：断言 10 张新词卡并抓取词义映射
  await expect(dialog.getByText(/本场新词 10 个/)).toBeVisible()
  const learnMap = await captureLearnMap(page)
  expect(Object.keys(learnMap)).toHaveLength(10)

  await clickButton(dialog.getByRole('button', { name: '已看完，开始测验' }))
  await answerQuiz(page, mode === 'fullScore' ? learnMap : {})
  await clickButton(dialog.getByRole('button', { name: '确认结果，领取奖励' }))
  await expect(dialog).toBeHidden()
}

test.describe('灵植记 · 玩家旅程', () => {
  test('完整一日：指引 → 满分答题 → 播种照料 → 结束一天进入次日', async ({ page }) => {
    await startNewGame(page, 'finish')
    await expect(page.getByText('第 1 月 · 第 1 天')).toBeVisible()
    await expect(page.getByRole('button', { name: /道心 0 今日未打卡/ })).toBeVisible()

    // 任务堂满分：合格奖励灵气 +3、贡献 +5、心得 +8 + 满分加成 +4，并完成道心打卡
    await finishDailyQuiz(page, 'fullScore')
    await expect(page.getByRole('button', { name: /任务堂 · 已完成 ✓/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /道心 1 今日已打卡/ })).toBeVisible()
    const afterQuiz = await readSave(page)
    expect(afterQuiz.quizDone).toBe(true)
    expect(afterQuiz.resources.qi).toBe(3)
    expect(afterQuiz.resources.contribution).toBe(5)
    expect(afterQuiz.resources.insight).toBe(12)

    // 播种：灵气 3 足够种一块青灵草（消耗 1 灵气，不占行动力）
    await clickButton(page.getByRole('button', { name: '1 号灵田，选择种子' }))
    const plantDialog = page.getByRole('dialog', { name: '1 号田 · 播种' })
    await expect(plantDialog).toBeVisible()
    await expect(plantDialog.getByText('库存 3')).toBeVisible() // 初始青灵草种子 ×3，其余种子均为 0
    await clickButton(plantDialog.getByRole('button', { name: '播种', exact: true }).first())
    await expect(plantDialog).toBeHidden()
    await expect(page.getByText(/生长 0\/15 天/)).toBeVisible()

    // 照料：浇灌与吐纳各耗 1 行动力（3 → 1）
    await clickButton(page.getByRole('button', { name: '浇灌 1 行动力' }))
    await clickButton(page.getByRole('button', { name: '吐纳 1 行动力' }))
    const afterTuna = await readSave(page)
    expect(afterTuna.cultivation).toBe(1)

    // 坊市只看不买
    await clickButton(page.getByRole('button', { name: '坊市' }))
    const marketDialog = page.getByRole('dialog', { name: '坊市' })
    await expect(marketDialog.getByText('持有灵石 50')).toBeVisible()
    await clickButton(marketDialog.getByRole('button', { name: '关闭坊市' }))

    // 结束一天：日结算管线 → 次日重置（行动力 3/3、任务未完成、自然生长 +1）
    await clickButton(page.getByRole('button', { name: /结束这一天/ }))
    await expect(page.getByText('第 1 月 · 第 2 天')).toBeVisible()
    // 同现实日推第二个游戏日 → 现实日锚 M1 的地力透支提示（顶栏标签唯一文案）
    await expect(page.getByText('地力透支 · 今日第 2 个游戏日')).toBeVisible()
    await expect(page.getByRole('button', { name: /任务堂 · 今日未完成/ })).toBeVisible()
    await expect(page.getByRole('button', { name: '浇灌 1 行动力' })).toBeEnabled()
    const nextDay = await readSave(page)
    expect(nextDay.day).toBe(2)
    expect(nextDay.quizDone).toBe(false)
  })

  test('答题全错：未达合格线仍放行，按未合格档发奖', async ({ page }) => {
    await startNewGame(page, 'skip')
    await finishDailyQuiz(page, 'allWrong')

    // 未合格奖励：灵气 +1、心得 +2、无贡献；打卡不看正确率
    const saved = await readSave(page)
    expect(saved.quizDone).toBe(true)
    expect(saved.resources.qi).toBe(1)
    expect(saved.resources.insight).toBe(2)
    expect(saved.resources.contribution).toBe(0)
    expect(saved.streakCount).toBe(1)
    await expect(page.getByRole('button', { name: /任务堂 · 已完成 ✓/ })).toBeVisible()
  })

  test('刷新恢复：测验中途关页，继续修行回到作答进度', async ({ page }) => {
    await startNewGame(page, 'skip')
    await clickButton(page.getByRole('button', { name: /任务堂 · 今日未完成/ }))
    const dialog = page.getByRole('dialog', { name: '任务堂' })
    await clickButton(dialog.getByRole('button', { name: /英语四级/ }))
    await clickButton(dialog.getByRole('button', { name: '开始今日任务' }))
    await clickButton(dialog.getByRole('button', { name: '已看完，开始测验' }))

    // 答两题（首题点首个选项保证可控），然后直接刷新
    for (let i = 0; i < 2; i++) {
      await clickButton(dialog.locator('.grid button:not([disabled])').first())
      await expect(dialog.getByRole('button', { name: /下一题|查看结果/ })).toBeVisible()
      await clickButton(dialog.getByRole('button', { name: /下一题|查看结果/ }))
    }
    await page.reload()
    await expect(page.getByRole('button', { name: '继续修行' })).toBeVisible()
    await clickButton(page.getByRole('button', { name: '继续修行' }))

    // 恢复后仍在第 1 天，任务堂回到第 3 题（已答 2 题）
    await expect(page.getByText('第 1 月 · 第 1 天')).toBeVisible()
    await clickButton(page.getByRole('button', { name: /任务堂 · 今日未完成/ }))
    await expect(dialog.getByText('3/10')).toBeVisible()
    await expect(dialog.getByRole('button', { name: '下一题' })).toBeHidden()
  })

  test('覆盖确认：有存档时开始新修行需游戏内弹窗确认，取消不丢档', async ({ page }) => {
    // 先造出一个存档：完整答完当日任务（弹窗确认只在 hasSave 时出现）
    await startNewGame(page, 'skip')
    await finishDailyQuiz(page, 'fullScore')
    await page.reload()
    await expect(page.getByRole('button', { name: '继续修行' })).toBeVisible()

    // 点开始修行 → 游戏内确认弹窗（原生 confirm 已替换）
    await clickButton(page.getByRole('button', { name: '以此形象开始修行' }))
    const confirmDialog = page.getByRole('alertdialog', { name: '开始新修行' })
    await expect(confirmDialog).toBeVisible()
    await expect(confirmDialog.getByText(/覆盖现有存档/)).toBeVisible()

    // 取消 → 留在启动页，旧存档仍在（继续修行入口还在）
    await clickButton(confirmDialog.getByRole('button', { name: '取消' }))
    await expect(confirmDialog).toBeHidden()
    await expect(page.getByRole('heading', { name: '灵植记' })).toBeVisible()
    await expect(page.getByRole('button', { name: '继续修行' })).toBeVisible()

    // 覆盖并开始 → 进入全新的第 1 天
    await clickButton(page.getByRole('button', { name: '以此形象开始修行' }))
    await clickButton(page.getByRole('alertdialog', { name: '开始新修行' }).getByRole('button', { name: '覆盖并开始' }))
    await expect(page.getByRole('heading', { name: '我的灵田' })).toBeVisible()
    await expect(page.getByText('第 1 月 · 第 1 天')).toBeVisible()
    const fresh = await readSave(page)
    expect(fresh.day).toBe(1)
    expect(fresh.resources.stones).toBe(50)
  })
})
