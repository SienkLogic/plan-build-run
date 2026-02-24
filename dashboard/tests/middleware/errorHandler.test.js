import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import errorHandler from '../../src/middleware/errorHandler.js';
import notFoundHandler from '../../src/middleware/notFoundHandler.js';

function createMockReq(overrides = {}) {
  return {
    originalUrl: '/test',
    get: vi.fn().mockReturnValue(null),
    ...overrides
  };
}

function createMockRes() {
  const res = {
    headersSent: false,
    statusCode: 200,
    headers: {},
    status: vi.fn().mockReturnThis(),
    render: vi.fn(),
    send: vi.fn(),
    setHeader: vi.fn()
  };
  return res;
}

describe('errorHandler', () => {
  let originalNodeEnv;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    vi.restoreAllMocks();
  });

  it('should render error page with status and message', () => {
    const err = new Error('Something broke');
    err.status = 500;
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.render).toHaveBeenCalledWith('error', expect.objectContaining({
      status: 500,
      message: 'Something broke'
    }));
  });

  it('should default to status 500 when error has no status', () => {
    const err = new Error('Unknown error');
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('should use err.statusCode when err.status is not set', () => {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should include stack trace in development mode', () => {
    process.env.NODE_ENV = 'development';
    const err = new Error('Dev error');
    err.status = 500;
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.render).toHaveBeenCalledWith('error', expect.objectContaining({
      stack: expect.any(String)
    }));
    const templateData = res.render.mock.calls[0][1];
    expect(templateData.stack).toBeTruthy();
  });

  it('should hide stack trace in production mode', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('Prod error');
    err.status = 500;
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    const templateData = res.render.mock.calls[0][1];
    expect(templateData.stack).toBeNull();
  });

  it('should include stack trace when NODE_ENV is not set (local dev default)', () => {
    delete process.env.NODE_ENV;
    const err = new Error('Local dev error');
    err.status = 500;
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    const templateData = res.render.mock.calls[0][1];
    expect(templateData.stack).toBeTruthy();
  });

  it('should delegate to next(err) when headers already sent', () => {
    const err = new Error('Headers sent');
    const req = createMockReq();
    const res = createMockRes();
    res.headersSent = true;
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.render).not.toHaveBeenCalled();
  });

  it('should return HTML fragment for HTMX requests', () => {
    const err = new Error('Not found');
    err.status = 404;
    const req = createMockReq({
      get: vi.fn((header) => header === 'HX-Request' ? 'true' : null)
    });
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.send).toHaveBeenCalled();
    expect(res.render).not.toHaveBeenCalled();
    const sentHtml = res.send.mock.calls[0][0];
    expect(sentHtml).toContain('Error 404');
    expect(sentHtml).toContain('Not found');
    expect(res.setHeader).toHaveBeenCalledWith('Vary', 'HX-Request');
  });

  it('HTMX error response escapes HTML in message', () => {
    const err = new Error('<script>alert(1)</script>');
    err.status = 500;
    const req = createMockReq({
      get: vi.fn((header) => header === 'HX-Request' ? 'true' : null)
    });
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    const sentHtml = res.send.mock.calls[0][0];
    expect(sentHtml).not.toContain('<script>alert');
    expect(sentHtml).toContain('&lt;script&gt;');
  });

  it('HTMX error response escapes HTML in stack trace', () => {
    process.env.NODE_ENV = 'development';
    const err = new Error('error with stack');
    err.status = 500;
    err.stack = '<img src=x onerror="alert(1)">';
    const req = createMockReq({
      get: vi.fn((header) => header === 'HX-Request' ? 'true' : null)
    });
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    const sentHtml = res.send.mock.calls[0][0];
    expect(sentHtml).not.toContain('<img src=x onerror=');
    expect(sentHtml).toContain('&lt;img');
  });

  it('should set Vary header for normal requests', () => {
    const err = new Error('Server error');
    err.status = 500;
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Vary', 'HX-Request');
  });

  it('should render full-page error with layout for normal (non-HTMX) requests', () => {
    const err = new Error('Server error');
    err.status = 500;
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.render).toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
    expect(res.render.mock.calls[0][0]).toBe('error');
    expect(res.render.mock.calls[0][1]).toEqual(expect.objectContaining({
      title: 'Error 500',
      status: 500,
      message: 'Server error',
      activePage: ''
    }));
  });
});

describe('notFoundHandler', () => {
  it('should create 404 error and call next', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    notFoundHandler(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.message).toContain(req.originalUrl);
  });

  it('should include the request URL in the error message', () => {
    const req = createMockReq({ originalUrl: '/nonexistent/path' });
    const res = createMockRes();
    const next = vi.fn();

    notFoundHandler(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.message).toContain('/nonexistent/path');
  });
});
