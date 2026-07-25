import { LayoutDashboard } from 'lucide-react'
import { PageScaffold } from '../../../components/common/PageScaffold'

export function AdminDashboardPage() {
  return (
    <PageScaffold
      description="Панель администратора конкретной организации с будущими операционными показателями."
      emptyDescription="Реальные показатели по заказам, сменам и складу будут подключены после создания бизнес-модулей."
      emptyTitle="Обзор организации пока пустой"
      icon={LayoutDashboard}
      title="Обзор организации"
    />
  )
}
