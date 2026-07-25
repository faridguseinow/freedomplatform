import { LayoutDashboard } from 'lucide-react'
import { PageScaffold } from '../../../components/common/PageScaffold'

export function PlatformOverviewPage() {
  return (
    <PageScaffold
      description="Глобальная панель владельца платформы для будущего контроля организаций, тарифов и системных настроек."
      emptyDescription="Метрики и системные события появятся после подключения бизнес-модулей и таблиц платформы."
      emptyTitle="Данные платформы пока не подключены"
      icon={LayoutDashboard}
      title="Обзор"
    />
  )
}
