import sanitizeHtml from 'sanitize-html';

// Blog posts are admin-written HTML that the frontend renders with dangerouslySetInnerHTML.
// Allow what the contentEditable editor produces (formatting, lists, links, images, simple colors)
// and drop scripts, event handlers, iframes and javascript: URLs, so one compromised or careless
// admin account can't become stored XSS for every visitor.
const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i];

const BLOG_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img', 'h1', 'h2', 'span', 'font', 'u', 's', 'strike', 'figure', 'figcaption',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    font: ['color'],
    '*': ['class', 'style'],
  },
  allowedStyles: {
    '*': {
      color: COLOR,
      'background-color': COLOR,
      'text-align': [/^(left|right|center|justify)$/],
      'font-weight': [/^(normal|bold|[1-9]00)$/],
      'font-style': [/^(normal|italic)$/],
      'text-decoration': [/^[a-z\s-]+$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['https'] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow' }),
  },
};

export function sanitizeBlogHtml(html: string): string {
  return sanitizeHtml(html, BLOG_HTML_OPTIONS);
}

export function sanitizeBlogPost<T extends { content: string } | null>(post: T): T {
  return post ? { ...post, content: sanitizeBlogHtml(post.content) } : post;
}
