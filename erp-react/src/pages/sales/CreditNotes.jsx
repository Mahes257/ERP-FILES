import SalesListPage from '../../components/SalesTable/SalesListPage';
import SalesViewPage from '../../components/SalesDetail/SalesViewPage';
import SalesDocumentDesign from '../../components/SalesDesign/SalesDocumentDesign';
import { creditNoteDesignConfig } from '../../config/salesDesignConfigs';
import { creditNoteListConfig, creditNoteViewConfig } from '../../config/salesPageConfigs';
import { SALES_FORM_CONFIGS } from '../../config/salesFormConfigs';
import CreditNoteFormPage from '../../components/SalesForm/CreditNoteFormPage';
import creditNoteService from '../../services/creditNoteService';
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';

export function CreditNotes({ embedded }) {
  return <SalesListPage config={creditNoteListConfig} embedded={embedded} />;
}

export function CreditNoteDetails() {
  return <SalesViewPage config={creditNoteViewConfig} />;
}

export function AddCreditNote() {
  return <CreditNoteFormPage config={SALES_FORM_CONFIGS.creditNote} service={creditNoteService} navigateToList="/credit-notes" backToList={SALES_EXEC_HUB_TABS.creditNotes} />;
}

export function EditCreditNote() {
  return <CreditNoteFormPage config={SALES_FORM_CONFIGS.creditNote} service={creditNoteService} navigateToList="/credit-notes" backToList={SALES_EXEC_HUB_TABS.creditNotes} />;
}

export function CreditNoteDesign() {
  return <SalesDocumentDesign config={creditNoteDesignConfig} />;
}

export default CreditNotes;
