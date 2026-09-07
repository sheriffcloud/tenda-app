type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'                                                                                                                                                      

  export interface Endpoint<
  TMethod extends HttpMethod,
  TParams = undefined,
  TBody = undefined,
  TQuery = undefined,
  TResponse = unknown
> {
  method: TMethod
  params: TParams
  body: TBody
  query: TQuery
  response: TResponse
}
