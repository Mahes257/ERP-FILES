import { useNavigate } from 'react-router-dom';
import MarketingDashboard from '../../components/Marketing/MarketingDashboard';

export default function DashboardPage() {
  const navigate = useNavigate();
  return (
    <div className="purchase-page cpr-page" style={{ paddingTop: 20, paddingBottom: 80 }}>
      <MarketingDashboard onNavigate={(page, filter) => {
        if (page && filter) navigate(`${page}?tab=${encodeURIComponent(filter)}`);
        else if (page) navigate(page);
      }} />      </div>
    );
}
