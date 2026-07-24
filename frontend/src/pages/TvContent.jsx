import { useCallback } from "react";
import TvContentEditModal from "../components/tvContent/TvContentEditModal";
import TvContentForm from "../components/tvContent/TvContentForm";
import TvContentList from "../components/tvContent/TvContentList";
import TvContentTopbar from "../components/tvContent/TvContentTopbar";
import { useConfirm } from "../components/Feedback/ConfirmProvider";
import { useToast } from "../components/Feedback/ToastProvider";
import { useTvContentAdmin } from "../hooks/useTvContentAdmin";
import "../styles/tvContent.css";

export default function TvContent() {
  const confirm = useConfirm();
  const toast = useToast();

  const showToast = useCallback((text, type = "success") => {
    toast[type]?.(text) ?? toast.show(text, type);
  }, [toast]);

  const {
    branches,
    editForm,
    editLoading,
    editOpen,
    form,
    items,
    loading,
    msg,
    uploading,
    closeEdit,
    loadContents,
    navigate,
    openEdit,
    removeItem,
    submitEdit,
    submitUpload,
    toggleItem,
    updateEditField,
    updateFormField,
  } = useTvContentAdmin({ confirm, showToast });

  function goToCheckin() {
    navigate("/checkin");
  }

  return (
    <div className="tvContent-page">
      <TvContentTopbar onBack={goToCheckin} onRefresh={loadContents} />

      <main className="tvContent-container">
        <TvContentForm
          branches={branches}
          form={form}
          msg={msg}
          onChange={updateFormField}
          onSubmit={submitUpload}
          uploading={uploading}
        />

        <TvContentList
          allBranches={branches}
          items={items}
          loading={loading}
          onEdit={openEdit}
          onRemove={removeItem}
          onToggle={toggleItem}
        />
      </main>

      {editOpen && (
        <TvContentEditModal
          branches={branches}
          editForm={editForm}
          editLoading={editLoading}
          onChange={updateEditField}
          onClose={closeEdit}
          onSubmit={submitEdit}
        />
      )}
    </div>
  );
}
