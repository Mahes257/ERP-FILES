import './error-page.css';
import { useNavigate } from 'react-router-dom';

const ERROR_CONTENT = {
  '400': {
    title: 'Bad Request',
    message: "We couldn't understand your request. Please check the information and try again.",
    primaryLabel: 'Try Again',
    secondaryLabel: 'Go to Home',
    pose: 'question'
  },
  '401': {
    title: 'Unauthorized',
    message: 'You need to sign in to access this page.',
    primaryLabel: 'Sign In',
    secondaryLabel: 'Go to Home',
    primaryHref: '/signin',
    secondaryHref: '/',
    pose: 'key'
  },
  '403': {
    title: 'Access Denied',
    message: "You don't have permission to view this page.",
    primaryLabel: 'Go to Home',
    secondaryLabel: 'Contact Administrator',
    primaryHref: '/',
    secondaryHref: '/dashboard',
    pose: 'barrier'
  },
  '404': {
    title: 'Page Not Found',
    message: "The page you're looking for doesn't exist or may have been moved.",
    primaryLabel: 'Go to Home',
    secondaryLabel: 'Back to Previous Page',
    primaryHref: '/',
    secondaryBack: true,
    pose: 'map'
  },
  '408': {
    title: 'Request Timeout',
    message: 'The server took too long to respond. Please try again.',
    primaryLabel: 'Try Again',
    secondaryLabel: 'Go to Home',
    pose: 'hourglass'
  },
  '429': {
    title: 'Too Many Requests',
    message: "You've sent too many requests in a short time. Please wait a moment and try again.",
    primaryLabel: 'Try Again Later',
    secondaryLabel: 'Go to Home',
    pose: 'slow'
  },
  '500': {
    title: 'Internal Server Error',
    message: 'Something went wrong on our end. Please try again later.',
    primaryLabel: 'Try Again',
    secondaryLabel: 'Go to Home',
    pose: 'tools'
  },
  '502': {
    title: 'Bad Gateway',
    message: 'The server received an invalid response from an upstream server.',
    primaryLabel: 'Try Again',
    secondaryLabel: 'Go to Home',
    pose: 'bridge'
  },
  '503': {
    title: 'Service Unavailable',
    message: "We're temporarily down for maintenance or experiencing high traffic. Please try again later.",
    primaryLabel: 'Try Again Later',
    secondaryLabel: 'Go to Home',
    pose: 'maintenance'
  },
  '504': {
    title: 'Gateway Timeout',
    message: 'The server took too long to respond from an upstream server.',
    primaryLabel: 'Try Again',
    secondaryLabel: 'Go to Home',
    pose: 'telescope'
  },
  network: {
    title: 'Network Error',
    message: "We couldn't connect to the server. Please check your internet connection and try again.",
    primaryLabel: 'Try Again',
    secondaryLabel: 'Go to Home',
    pose: 'network'
  },
  unknown: {
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Please try again.',
    primaryLabel: 'Try Again',
    secondaryLabel: 'Go to Home',
    pose: 'unknown'
  }
};

function FoxIllustration({ status = 'unknown' }) {
  const assetName = status === 'network'
    ? 'network-error'
    : status === 'unknown'
      ? 'generic-error'
      : status;
  return (
    <img
      className="error-page__image"
      src={`/assets/error-pages/${assetName}.png`}
      alt={`Orange fox illustration for ${status} error`}
    />
  );
}

function runAction(action, navigate) {
  if (typeof action === 'function') {
    action();
    return;
  }
  if (action) navigate(action);
}

export default function ErrorPage({
  status,
  title,
  message,
  illustration,
  primaryAction,
  secondaryAction
}) {
  const navigate = useNavigate();
  const key = String(status || 'unknown').toLowerCase();
  const defaults = ERROR_CONTENT[key] || ERROR_CONTENT.unknown;
  const primary = typeof primaryAction === 'object' ? primaryAction : { label: primaryAction };
  const secondary = typeof secondaryAction === 'object' ? secondaryAction : { label: secondaryAction };

  return (
    <main className="error-page">
      <section className="error-page__content" aria-labelledby="error-page-title">
        <p className="error-page__status">{status || '?'}</p>
        <h1 id="error-page-title">{title || defaults.title}</h1>
        <p className="error-page__message">{message || defaults.message}</p>
        <div className="error-page__illustration">
          {illustration || <FoxIllustration status={key} />}
        </div>
        <div className="error-page__actions">
          <button
            type="button"
            className="error-page__primary"
            onClick={() => runAction(
              primary?.onClick ||
              primary?.href ||
              defaults.primaryHref ||
              (() => window.location.reload()),
              navigate
            )}
          >
            {primary?.label || defaults.primaryLabel}
          </button>
          <button
            type="button"
            className="error-page__secondary"
            onClick={() => runAction(
              secondary?.onClick ||
              secondary?.href ||
              (defaults.secondaryBack
                ? () => (window.history.length > 1 ? navigate(-1) : navigate('/'))
                : defaults.secondaryHref || '/'),
              navigate
            )}
          >
            {secondary?.label || defaults.secondaryLabel}
          </button>
        </div>
      </section>
    </main>
  );
}

export { ERROR_CONTENT, FoxIllustration };
