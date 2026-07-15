export function validate(schema) {
  return function validateRequest(req, res, next) {
    try {
      req.validated = schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      });
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
