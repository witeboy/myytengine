import React from 'react';
import { Youtube } from 'lucide-react';

const PLATFORM_META = {
  youtube: {
    name: 'YouTube',
    color: 'bg-red-600',
    textColor: 'text-red-600',
    borderColor: 'border-red-200',
    bgLight: 'bg-red-50',
    icon: (props) => <Youtube {...props} />,
  },
  tiktok: {
    name: 'TikTok',
    color: 'bg-black',
    textColor: 'text-black',
    borderColor: 'border-gray-300',
    bgLight: 'bg-gray-50',
    icon: (props) => (
      <svg {...props} viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.44v-7.36a8.16 8.16 0 005.58 2.18v-3.45a4.85 4.85 0 01-5.58-2.18V15.2"/>
      </svg>
    ),
  },
  x: {
    name: 'X.com',
    color: 'bg-black',
    textColor: 'text-black',
    borderColor: 'border-gray-300',
    bgLight: 'bg-gray-50',
    icon: (props) => (
      <svg {...props} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
  instagram: {
    name: 'Instagram',
    color: 'bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400',
    textColor: 'text-pink-600',
    borderColor: 'border-pink-200',
    bgLight: 'bg-pink-50',
    icon: (props) => (
      <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
      </svg>
    ),
  },
};

export { PLATFORM_META };

export default function PlatformIcon({ platform, className = "w-5 h-5" }) {
  const meta = PLATFORM_META[platform];
  if (!meta) return null;
  const Icon = meta.icon;
  return <Icon className={className} />;
}