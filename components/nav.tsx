'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Segmentos', match: ['/', '/kmeans'] },
  { href: '/datos', label: 'Datos', match: ['/datos'] },
  { href: '/cohorts', label: 'Cohortes', match: ['/cohorts'] },
  { href: '/clv', label: 'CLV', match: ['/clv'] },
  { href: '/churn', label: 'Churn', match: ['/churn'] },
  { href: '/train', label: 'Entrenar', match: ['/train'] },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${
              l.match.includes(pathname)
                ? 'border-blue-600 font-medium text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
