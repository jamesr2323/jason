class Jason::OutboundMessageQueueWorker
  include Sidekiq::Worker

  def perform
    batch = get_batch
    return if batch.size == 0

    Jason.pusher.trigger_batch(batch)
  end

  private

  def get_batch
    batch_json = $redis_jason.multi do |r|
      r.lrange("jason:outbound_message_queue", 0, 9) # get first 10 elements
      r.ltrim("jason:outbound_message_queue", 10, -1) # delete first 10 elements
    end[0]

    batch_json.map { |event| JSON.parse(event).with_indifferent_access } # Pusher wants symbol keys
  end
end