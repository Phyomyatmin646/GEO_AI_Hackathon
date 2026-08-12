import Link from 'next/link';
import DailyMapView from '../components/DailyMapView';
import { SiteNavigation } from '../components/SiteNavigation';

export const metadata = {
  title: 'Daily Map - Myanmar Agricultural Pipeline',
  description: 'Daily GEE Inference & Interactive 5 km Map',
};

export default function DailyMapPage() {
  return (
    <main className="daily-page">
      <header className="daily-topbar">
        <Link href="/" className="daily-brand" aria-label="Go to home">
          <span className="harvest-brand-logo daily-brand-logo" role="img" />
        </Link>
        <div className="daily-topbar-copy">
          <h1 className="text-xl font-bold text-gray-900">Myanmar Agricultural Geo-CSV Pipeline</h1>
          <p className="text-sm text-gray-500">Daily GEE Inference & Interactive 5 km Map (Experimental)</p>
        </div>
        <SiteNavigation />
      </header>
      
      <div className="flex-1 relative">
        <DailyMapView />
      </div>
    </main>
  );
}
