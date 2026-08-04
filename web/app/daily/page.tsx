import DailyMapView from '../components/DailyMapView';

export const metadata = {
  title: 'Daily Map - Myanmar Agricultural Pipeline',
  description: 'Daily GEE Inference & Interactive 5 km Map',
};

export default function DailyMapPage() {
  return (
    <main className="w-full h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Myanmar Agricultural Geo-CSV Pipeline</h1>
          <p className="text-sm text-gray-500">Daily GEE Inference & Interactive 5 km Map (Experimental)</p>
        </div>
        <div className="flex items-center gap-4 text-sm font-medium">
          <a href="/" className="text-blue-600 hover:text-blue-800">
            &larr; Back to Dashboard
          </a>
        </div>
      </header>
      
      <div className="flex-1 relative">
        <DailyMapView />
      </div>
    </main>
  );
}
