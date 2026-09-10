# exceptions.py - Application-level exception hierarchy
#
# Route/service code should raise these instead of constructing HTTPException by
# hand; the handlers registered in main.py translate them into a consistent JSON
# response shape ({"detail": ...}) with the right status code, and make sure
# unexpected errors never leak internals (stack traces, SQL text) to the client.


class AppError(Exception):
    """Base class for application errors that carry an HTTP status code."""

    status_code = 500

    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


class DomainError(AppError):
    """A business rule was violated (e.g. an invalid state transition)."""

    status_code = 422


class NotFoundError(AppError):
    """The requested resource does not exist."""

    status_code = 404


class AuthenticationError(AppError):
    """The request has no valid credentials."""

    status_code = 401


class AuthorizationError(AppError):
    """The caller is authenticated but not allowed to do this."""

    status_code = 403


class ExternalIntegrationError(AppError):
    """An external system (Claude, SMTP, RabbitMQ, ...) failed or was unreachable."""

    status_code = 502
