import type { Client, Config, RequestOptions } from './types';
import {
  createDefaultConfig,
  createInterceptors,
  createQuerySerializer,
  getParseAs,
  getUrl,
  mergeHeaders,
} from './utils';

type ReqInit = Omit<RequestInit, 'body' | 'headers'> & {
  body?: any;
  headers: ReturnType<typeof mergeHeaders>;
};

let globalConfig = createDefaultConfig();

const globalInterceptors = createInterceptors<
  Request,
  Response,
  RequestOptions
>();

export const createClient = (config: Config): Client => {
  const defaultConfig = createDefaultConfig();
  const _config = { ...defaultConfig, ...config };

  if (_config.baseUrl?.endsWith('/')) {
    _config.baseUrl = _config.baseUrl.substring(0, _config.baseUrl.length - 1);
  }
  _config.headers = mergeHeaders(defaultConfig.headers, _config.headers);

  if (_config.global) {
    globalConfig = { ..._config };
  }

  // @ts-ignore
  const getConfig = () => (_config.root ? globalConfig : _config);

  const interceptors = _config.global
    ? globalInterceptors
    : createInterceptors<Request, Response, RequestOptions>();

  // @ts-ignore
  const request: Client['request'] = async (options) => {
    const config = getConfig();

    const opts: RequestOptions = {
      ...config,
      ...options,
      headers: mergeHeaders(config.headers, options.headers),
    };
    if (opts.body && opts.bodySerializer) {
      opts.body = opts.bodySerializer(opts.body);
    }

    const url = getUrl({
      baseUrl: opts.baseUrl ?? '',
      path: opts.path,
      query: opts.query,
      querySerializer:
        typeof opts.querySerializer === 'function'
          ? opts.querySerializer
          : createQuerySerializer(opts.querySerializer),
      url: opts.url,
    });

    const requestInit: ReqInit = {
      redirect: 'follow',
      ...opts,
    };

    let request = new Request(url, requestInit);

    for (const fn of interceptors.request._fns) {
      request = await fn(request, opts);
    }

    const _fetch = opts.fetch!;
    let response = await _fetch(request);

    for (const fn of interceptors.response._fns) {
      response = await fn(response, request, opts);
    }

    const result = {
      request,
      response,
    };

    // return empty objects so truthy checks for data/error succeed
    if (
      response.status === 204 ||
      response.headers.get('Content-Length') === '0'
    ) {
      if (response.ok) {
        return {
          data: {},
          ...result,
        };
      }
      return {
        error: {},
        ...result,
      };
    }

    if (response.ok) {
      if (opts.parseAs === 'stream') {
        return {
          data: response.body,
          ...result,
        };
      }
      const parseAs =
        (opts.parseAs === 'auto'
          ? getParseAs(response.headers.get('Content-Type'))
          : opts.parseAs) ?? 'json';

      let data = await response[parseAs]();
      if (parseAs === 'json' && opts.responseTransformer) {
        data = await opts.responseTransformer(data);
      }

      return {
        data,
        ...result,
      };
    }

    let error = await response.text();
    try {
      error = JSON.parse(error);
    } catch {
      // noop
    }
    return {
      error,
      ...result,
    };
  };

  return {
    connect: (options) => request({ ...options, method: 'CONNECT' }),
    delete: (options) => request({ ...options, method: 'DELETE' }),
    get: (options) => request({ ...options, method: 'GET' }),
    getConfig,
    head: (options) => request({ ...options, method: 'HEAD' }),
    interceptors,
    options: (options) => request({ ...options, method: 'OPTIONS' }),
    patch: (options) => request({ ...options, method: 'PATCH' }),
    post: (options) => request({ ...options, method: 'POST' }),
    put: (options) => request({ ...options, method: 'PUT' }),
    request,
    trace: (options) => request({ ...options, method: 'TRACE' }),
  };
};

export const client = createClient({
  ...globalConfig,
  // @ts-ignore
  root: true,
});
