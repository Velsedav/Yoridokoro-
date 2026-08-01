export function buildQuotePages(heights: number[], availableHeight: number, gap = 14): number[][] {
  const pages: number[][] = [];
  const usableHeight = Number.isFinite(availableHeight) ? Math.max(0, availableHeight) : 0;
  const safeGap = Number.isFinite(gap) ? Math.max(0, gap) : 0;

  for (let index = 0; index < heights.length;) {
    const currentHeight = Number.isFinite(heights[index]) ? Math.max(0, heights[index]) : Number.POSITIVE_INFINITY;
    const nextHeight = Number.isFinite(heights[index + 1]) ? Math.max(0, heights[index + 1]) : Number.POSITIVE_INFINITY;
    const pairFits = index + 1 < heights.length && currentHeight + safeGap + nextHeight <= usableHeight;

    pages.push(pairFits ? [index, index + 1] : [index]);
    index += pairFits ? 2 : 1;
  }

  return pages;
}
