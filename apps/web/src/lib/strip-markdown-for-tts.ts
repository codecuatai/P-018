export function stripMarkdownForTts(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')   // [text](url) → text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')   // ![alt](url) → alt
    .replace(/```[\s\S]*?```/g, '')              // code blocks
    .replace(/`([^`]+)`/g, '$1')                 // inline code
    .replace(/(\*\*|__)(.*?)\1/g, '$2')          // bold
    .replace(/(\*|_)(.*?)\1/g, '$2')             // italic
    .replace(/^#{1,6}\s+/gm, '')                 // headings
    .replace(/^[-*+]\s+/gm, '')                  // list markers
    .replace(/^\d+\.\s+/gm, '')                  // ordered list
    .replace(/\n{2,}/g, '. ')                    // paragraph breaks → pause
    .trim();
}
