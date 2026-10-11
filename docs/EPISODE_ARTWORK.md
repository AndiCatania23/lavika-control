# Card degli episodi

La lista Episodi e il dettaglio mostrano `effective_thumbnail_url`, risolta in lettura dall’API. Per Match Reaction il registro unico è `https://lavikasport.app/immagini/match-reaction/cards.json`: l’app importa lo stesso JSON. I nomi completi provengono dal profilo `speaker_id`; speaker assenti o senza card registrata usano la generica.

Control legge il registro con cache di 60 secondi, timeout di 5 secondi e validazione dei percorsi. In caso di indisponibilità conserva la miniatura salvata. Gli altri format non cambiano.

`thumbnail_url` rimane il valore editoriale modificabile: l’immagine effettiva non viene salvata nel database. Il dettaglio distingue “Card nell’app” dalla miniatura episodio. Dopo un cambio relatore, salvare per aggiornare la card.

Per aggiungere una card, pubblicare l’immagine e la voce nel registro JSON dell’app via GitHub; non occorre aggiornare Control. La risposta PATCH ricalcola la card dopo il salvataggio. Il contratto legacy senza parametri resta invariato.

Verifica: build passata; test di selezione, fallback, conservazione dei dati modificabili e registro non valido passati. Lint API/helper pulito; la pagina conserva il precedente errore set-state-in-effect del selettore partite.
