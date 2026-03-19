import { DashboardSidebar } from '@/components/admin/dashboard-sidebar'

export default function SettingsPage() {
  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar />
      <div className="flex-1 p-8 overflow-auto">
        <h1 className="text-2xl font-semibold mb-6">Settings</h1>
        <div className="bg-card border rounded-lg p-6">
          <p className="text-muted-foreground">Settings configuration will be available here.</p>
        </div>
      </div>
    </div>
  )
}
