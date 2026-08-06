import { Link } from 'react-router-dom';
import { Boxes } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Boxes className="h-8 w-8" />
      </div>
      <h1 className="mt-6 text-3xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/" className="btn-primary mt-6">
        Back to Dashboard
      </Link>
    </div>
  );
}
