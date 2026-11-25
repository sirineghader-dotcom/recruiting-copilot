-- One-off: after improving the CV-reading prompt, re-read the 10 medical CVs.
-- Removes those candidates (their skills go with them; the cv_files log keeps its history),
-- so re-uploading the same files creates them again with the new extraction.
delete from candidates
where cv_file_name in (
  'GraceVillanueva_MedicalVA_2026.pdf', 'Joy_Mercado_MedVA.docx', 'Mariam_Saleh_CV.pdf',
  'Patricia_Lim_Resume.pdf', 'scan_0012.pdf', 'CV_Nadia_Bouzid.docx', 'Rosa_Martinez_Resume.docx',
  'Anjali_Sharma_Scribe.pdf', 'Michelle_Tan_RN_MedVA.pdf', 'Chidi_Eze_CV.docx')
  and id not in (select candidate_id from shortlists)
returning full_name;
