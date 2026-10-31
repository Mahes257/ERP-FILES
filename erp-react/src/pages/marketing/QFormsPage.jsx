import QFormList from '../../components/Marketing/QFormList';
import QuestionnaireForm from '../../components/Marketing/QuestionnaireForm';
import QFormPreview from '../../components/Marketing/QFormPreview';
import { useState } from 'react';

export default function QFormsPage() {
  // View states: 'list' | 'form' | 'preview'
  const [view, setView] = useState('list');
  const [openVisitId, setOpenVisitId] = useState(null);
  const [openFormId, setOpenFormId] = useState(null);

  const goToList = () => {
    setView('list');
    setOpenVisitId(null);
    setOpenFormId(null);
  };

  const openForm = (visitId, formId) => {
    setOpenVisitId(visitId || null);
    setOpenFormId(formId || null);
    setView('form');
  };

  const openNewForm = () => {
    setOpenVisitId(null);
    setOpenFormId(null);
    setView('form');
  };

  const openPreview = (formId) => {
    setView('preview');
    setOpenFormId(formId);
  };

  if (view === 'preview' && openFormId) {
    return (
      <div className="purchase-page cpr-page" style={{ paddingTop: 20, paddingBottom: 80 }}>
        <QFormPreview
          formId={openFormId}
          onClose={goToList}
        />
      </div>
    );
  }

  if (view === 'form') {
    return (
      <div className="purchase-page cpr-page" style={{ paddingTop: 20, paddingBottom: 80 }}>
        <QuestionnaireForm
          visitId={openVisitId}
          formId={openFormId}
          onClose={goToList}
          onSaveAndContinue={(savedFormId) => openPreview(savedFormId)}
        />
      </div>
    );
  }

  return (
    <div className="purchase-page cpr-page" style={{ paddingTop: 20, paddingBottom: 80 }}>
      <QFormList
        onOpenForm={(visitId, formId) => openForm(visitId, formId)}
        onNewForm={openNewForm}
      />
    </div>
  );
}
